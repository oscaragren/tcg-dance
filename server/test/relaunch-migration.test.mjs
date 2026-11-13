import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeClock, seededRandom, startTestApp, TEST_CATALOG } from "./harness.mjs";

// The relaunch migration (#47), tested the way it is used: seed a database with
// old-rule data, run it, then look at the result through the API.
//
// Collection "test": 2 Common (100 Copies each), 2 Rare (10 each), 1 Epic (5),
// 1 Legendary (1). Under the OLD Achievement table (scaled to 10%) this paid:
//   collection-complete-test 500, rare-1 5 (removed), rare-all 400, epic-all 500,
//   legendary-all 1000. The NEW table pays 5000 / 50 first-Rare / 1000 / 2000 / 3000.
const CATALOG = {
  ...TEST_CATALOG,
  cards: [
    { id: "c1", collectionId: "test", rarity: "common", name: "C1" },
    { id: "c2", collectionId: "test", rarity: "common", name: "C2" },
    { id: "r1", collectionId: "test", rarity: "rare", name: "R1" },
    { id: "r2", collectionId: "test", rarity: "rare", name: "R2" },
    { id: "e1", collectionId: "test", rarity: "epic", name: "E1" },
    { id: "l1", collectionId: "test", rarity: "legendary", name: "L1" },
  ],
  copiesPerRarity: { common: 100, rare: 10, epic: 5, legendary: 1, special: 1 },
};

let t, clock;
afterEach(() => t.close());

async function setup(opts = {}) {
  clock = fakeClock("2026-03-10T12:00:00+01:00");
  t = await startTestApp({ clock, catalog: CATALOG, ...opts });
}
const state = async (p) => (await t.request("GET", "/api/game/state", { cookie: p.cookie })).body;
const own = (p, ...cardIds) => {
  for (const id of cardIds) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(p.userId, id);
};
const claimed = (p, ...ids) => {
  for (const id of ids) t.db.prepare("INSERT INTO achievement_claims (user_id, achievement_id, claimed_at) VALUES (?, ?, ?)").run(p.userId, id, "2026-02-01T00:00:00.000Z");
};
const trade = (id, from, to, status = "pending") =>
  t.db.prepare("INSERT INTO trades (id, sender_user_id, receiver_user_id, status, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(id, from.userId, to.userId, status, new Date(clock.now() - 3600_000).toISOString());
const perPlayer = (p) => t.db.prepare("SELECT * FROM relaunch_migration_players WHERE user_id = ?").get(p.userId);
const reopen = async () => t.request("PUT", "/api/admin/maintenance", { cookie: await t.adminCookie(), body: { on: false } });

test("Achievements: pays removed earned-but-unclaimed ones and the full difference where the new table pays more", async () => {
  await setup();
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  own(a, "c1", "r1", "r2", "e1", "l1"); // no c2: the old global "all cards" Achievement stays unearned
  // claimed under the old table: rare-all 400 (new 1000), legendary-all 1000 (new 3000)
  claimed(a, "collection-rarity-test-rare-all", "collection-rarity-test-legendary-all");
  // b claimed a removed Achievement and has nothing else: no clawback, nothing to pay
  claimed(b, "collection-rarity-test-rare-1");
  own(b, "r1");
  const before = { a: await state(a), b: await state(b) };

  const report = await t.runRelaunchMigration();
  await reopen();

  // a: unclaimed removed rare-1 (5) + (1000-400) + (3000-1000); epic-all and complete stay claimable
  const after = await state(a);
  assert.equal(after.diamonds, before.a.diamonds + 5 + 600 + 2000);
  assert.equal((await state(b)).diamonds, before.b.diamonds);
  assert.equal(perPlayer(a).achievement_payout, 2605);
  assert.equal(perPlayer(b), undefined);
  assert.equal(report.achievementPayoutTotal, 2605);
  assert.deepEqual(after.ownedCardIds.sort(), before.a.ownedCardIds.sort());
  const list = await t.request("GET", "/api/achievements", { cookie: a.cookie });
  assert.equal(list.body.find((x) => x.id === "collection-rarity-test-epic-all").claimed, false);
});

test("Trades: all pending Trades are cancelled and counted per player; settled ones are left alone", async () => {
  await setup();
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  const c = await t.registerPlayer();
  trade("t1", a, b);
  trade("t2", b, a);
  trade("t3", a, c);
  trade("t4", b, c, "accepted");
  const report = await t.runRelaunchMigration();

  const statuses = Object.fromEntries(t.db.prepare("SELECT id, status FROM trades").all().map((r) => [r.id, r.status]));
  assert.deepEqual(statuses, { t1: "cancelled", t2: "cancelled", t3: "cancelled", t4: "accepted" });
  assert.equal(perPlayer(a).cancelled_trades, 3);
  assert.equal(perPlayer(b).cancelled_trades, 2);
  assert.equal(perPlayer(c).cancelled_trades, 1);
  assert.equal(report.cancelledTrades, 3);
});

test("Streak: a live Streak keeps its position, a lapsed one goes to 0, always within 0-6", async () => {
  await setup();
  const live = await t.registerPlayer();
  const yesterday = await t.registerPlayer();
  const lapsed = await t.registerPlayer();
  const setStreak = (p, n, date) => t.db.prepare("UPDATE player_state SET diamond_streak = ?, last_daily_claim_date = ? WHERE user_id = ?").run(n, date, p.userId);
  setStreak(live, 3, "2026-03-10");
  setStreak(yesterday, 6, "2026-03-09");
  setStreak(lapsed, 5, "2026-03-01");
  await t.runRelaunchMigration();
  await reopen();
  assert.equal((await state(live)).diamondStreak, 3);
  assert.equal((await state(yesterday)).diamondStreak, 6);
  assert.equal((await state(lapsed)).diamondStreak, 0);
});

test("Chests: existing Chests are tagged with the old table and still pay from it", async () => {
  await setup({ random: seededRandom([0]) });
  const p = await t.registerPlayer();
  const now = new Date(clock.now()).toISOString();
  t.db.prepare("INSERT INTO chests (id, user_id, type, bought_at, ready_at, payout_table) VALUES ('x', ?, 'bronze', ?, ?, 'v2')").run(p.userId, now, now);
  const before = (await state(p)).diamonds;
  await t.runRelaunchMigration();
  await reopen();
  const res = await t.request("POST", "/api/game/chests/x/collect", { cookie: p.cookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.diamondsAwarded, 15); // v1 bronze minimum, not v2's 10
  assert.equal((await state(p)).diamonds, before + 15);
});

test("Top-ups: a Collection under 3% Rare+ gets its first Top-up, logged", async () => {
  await setup();
  const rem = (id, n) => t.db.prepare("UPDATE card_pool SET copies_remaining = ? WHERE card_id = ?").run(n, id);
  rem("r1", 5); rem("r2", 0); rem("e1", 0); rem("l1", 0); // 5 / 205 = 2.4%
  const report = await t.runRelaunchMigration();
  const log = t.db.prepare("SELECT collection_id, rare, epic FROM topup_log").all();
  assert.deepEqual(log.map((r) => ({ ...r })), [{ collection_id: "test", rare: 9, epic: 2 }]);
  assert.deepEqual(report.topUps, [{ collectionId: "test", rare: 9, epic: 2 }]);
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM topups").get().n, 0);
  const admin = await t.adminCookie();
  assert.equal((await t.request("GET", "/api/admin/topups", { cookie: admin })).body.log.length, 1);
});

test("Top-ups: a healthy Collection is left alone", async () => {
  await setup();
  await t.runRelaunchMigration();
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM topup_log").get().n, 0);
});

test("maintenance is switched on and stays on", async () => {
  await setup();
  const p = await t.registerPlayer();
  await t.runRelaunchMigration({ reopensAt: "2026-03-11T00:00:00.000Z", note: "Relansering" });
  const res = await t.request("GET", "/api/game/state", { cookie: p.cookie });
  assert.equal(res.status, 503);
  assert.equal(res.body.note, "Relansering");
});

test("Copies and Diamonds are untouched when there is nothing to pay", async () => {
  await setup();
  const p = await t.registerPlayer();
  own(p, "c1", "c1");
  const before = await state(p);
  await t.runRelaunchMigration();
  await reopen();
  const after = await state(p);
  assert.equal(after.diamonds, before.diamonds);
  assert.deepEqual(after.ownedCardIds, before.ownedCardIds);
});

test("running it twice changes nothing the second time", async () => {
  await setup();
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  own(a, "c1", "r1", "r2", "l1");
  claimed(a, "collection-rarity-test-rare-all");
  trade("t1", a, b);
  t.db.prepare("UPDATE card_pool SET copies_remaining = 0 WHERE card_id IN ('r1','r2','e1','l1')").run();
  const first = await t.runRelaunchMigration();
  assert.equal(first.alreadyRun, false);
  const dump = () => JSON.stringify(["users", "player_state", "owned_cards", "trades", "card_pool", "topup_log", "game_events", "chests", "relaunch_migration_players"]
    .map((tbl) => t.db.prepare(`SELECT * FROM ${tbl}`).all()));
  const snapshot = dump();
  // The admin has since reopened the game by hand: a rerun must not close it again.
  await reopen();
  const second = await t.runRelaunchMigration();
  assert.equal(second.alreadyRun, true);
  assert.equal(dump(), snapshot);
  assert.equal((await t.request("GET", "/api/maintenance")).body.on, false);
});
