import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, TEST_CATALOG } from "./harness.mjs";

let t;
afterEach(() => t.close());

// Collection "test": 2 common (100 each), 2 rare (10 each), 1 epic (5), 1 legendary (1).
// Original Rare:Epic ratio is 20:5 = 4:1.
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

const remaining = (id, n) => t.db.prepare("UPDATE card_pool SET copies_remaining = ? WHERE card_id = ?").run(n, id);
const rarePlus = (rare, epic = 0, legendary = 0) => { remaining("r1", rare); remaining("r2", 0); remaining("e1", epic); remaining("l1", legendary); };
const pending = async (admin) => (await t.request("GET", "/api/admin/topups", { cookie: admin })).body.pending;
const poolOf = (id) => t.db.prepare("SELECT total_copies AS total, copies_remaining AS rem FROM card_pool WHERE card_id = ?").get(id);

async function setup() {
  t = await startTestApp({ catalog: CATALOG });
  return t.adminCookie();
}

test("a healthy pool has no pending Top-up", async () => {
  const admin = await setup();
  assert.deepEqual(await pending(admin), []);
});

test("Rare+ share below 3% creates one pending Top-up, filled to reach 7% in the original Rare:Epic ratio", async () => {
  const admin = await setup();
  rarePlus(5); // 5 / 205 = 2.4%
  const list = await pending(admin);
  assert.equal(list.length, 1);
  assert.equal(list[0].collectionId, "test");
  // N = ceil((0.07*205 - 5) / 0.93) = 11, split 4:1 -> 9 Rare, 2 Epic, never Legendary/Special
  assert.deepEqual([list[0].rare, list[0].epic], [9, 2]);
  assert.equal(list[0].legendary, undefined);
  assert.equal((await pending(admin)).length, 1); // still one
});

test("pending amounts re-check as the pool changes, and clear once the share recovers", async () => {
  const admin = await setup();
  rarePlus(5);
  await pending(admin);
  rarePlus(2); // 2 / 202
  const [p] = await pending(admin);
  assert.ok(p.rare + p.epic > 11);
  rarePlus(20); // 20 / 220 = 9%
  assert.deepEqual(await pending(admin), []);
});

test("one email goes to the admin when a Top-up becomes pending, not on every re-check", async () => {
  const admin = await setup();
  rarePlus(5);
  await pending(admin);
  rarePlus(4);
  await pending(admin);
  assert.equal(t.mailer.topUps.length, 1);
  assert.equal(t.mailer.topUps[0].to, "admin@example.com");
});

test("packs keep selling while a Top-up is pending", async () => {
  const admin = await setup();
  const player = await t.registerPlayer();
  rarePlus(5);
  await pending(admin);
  const res = await t.request("POST", "/api/game/buy-pack", { cookie: player.cookie, body: { collectionId: "test", quantity: 1 } });
  assert.equal(res.status, 200);
});

test("a purchase that pushes the share under 3% makes the Top-up pending without an admin visit", async () => {
  const admin = await setup();
  const player = await t.registerPlayer();
  rarePlus(7); // 7/207 = 3.4%, fine
  assert.deepEqual(await pending(admin), []);
  rarePlus(6); // 6 / 206 = 2.9%: only a pool change, no admin request
  await t.request("POST", "/api/game/buy-pack", { cookie: player.cookie, body: { collectionId: "test", quantity: 1 } });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(t.mailer.topUps.length, 1);
});

test("approving applies the amounts, logs it as approved, and spreads Copies over that Rarity's Cards", async () => {
  const admin = await setup();
  rarePlus(5);
  await pending(admin);
  const res = await t.request("POST", "/api/admin/topups/test/approve", { cookie: admin, body: { rare: 9, epic: 2 } });
  assert.equal(res.status, 200);
  assert.deepEqual(await pending(admin), []);
  assert.equal(poolOf("e1").rem, 2);
  assert.equal(poolOf("r1").rem + poolOf("r2").rem, 5 + 9); // 5 were left, 9 added across both Rare Cards
  const log = (await t.request("GET", "/api/admin/topups", { cookie: admin })).body.log;
  assert.equal(log.length, 1);
  assert.deepEqual([log[0].collectionId, log[0].rare, log[0].epic, log[0].source], ["test", 9, 2, "approved"]);
  assert.ok(log[0].at);
});

test("the approved amounts can be edited", async () => {
  const admin = await setup();
  rarePlus(5);
  await pending(admin);
  await t.request("POST", "/api/admin/topups/test/approve", { cookie: admin, body: { rare: 20, epic: 4 } });
  const log = (await t.request("GET", "/api/admin/topups", { cookie: admin })).body.log;
  assert.deepEqual([log[0].rare, log[0].epic], [20, 4]);
});

test("added Copies survive a restart's pool sync", async () => {
  const admin = await setup();
  rarePlus(5);
  await pending(admin);
  await t.request("POST", "/api/admin/topups/test/approve", { cookie: admin, body: { rare: 9, epic: 2 } });
  const before = t.db.prepare("SELECT SUM(total_copies) n FROM card_pool").get().n;
  assert.equal(before, 200 + 20 + 5 + 1 + 11);
  const { createApp } = await import("../app.mjs");
  await createApp({ db: t.db, clock: t.clock, random: Math.random, mailer: t.mailer, catalog: CATALOG, config: { jwtSecret: "x", isProduction: false, distPath: "/x" } });
  assert.equal(t.db.prepare("SELECT SUM(total_copies) n FROM card_pool").get().n, before);
});

test("a dismissed Top-up stays quiet until the share rises above 3% and falls below it again", async () => {
  const admin = await setup();
  rarePlus(5);
  await pending(admin);
  assert.equal((await t.request("POST", "/api/admin/topups/test/dismiss", { cookie: admin })).status, 200);
  assert.deepEqual(await pending(admin), []);
  rarePlus(3); // still below, worse
  assert.deepEqual(await pending(admin), []);
  rarePlus(10); // 10/210 = 4.8%, above
  assert.deepEqual(await pending(admin), []);
  rarePlus(5); // below again
  assert.equal((await pending(admin)).length, 1);
  assert.equal(t.mailer.topUps.length, 2);
});

test("Top-up now accepts custom amounts, even with nothing pending", async () => {
  const admin = await setup();
  const res = await t.request("POST", "/api/admin/topups/now", { cookie: admin, body: { collectionId: "test", rare: 3, epic: 1 } });
  assert.equal(res.status, 200);
  const log = (await t.request("GET", "/api/admin/topups", { cookie: admin })).body.log;
  assert.deepEqual([log[0].rare, log[0].epic, log[0].source], [3, 1, "manual"]);
  assert.equal(poolOf("e1").total, 6);
  assert.equal((await t.request("POST", "/api/admin/topups/now", { cookie: admin, body: { collectionId: "test", rare: -1, epic: 0 } })).status, 400);
  assert.equal((await t.request("POST", "/api/admin/topups/now", { cookie: admin, body: { collectionId: "nope", rare: 1, epic: 0 } })).status, 400);
});

test("Top-up endpoints need admin", async () => {
  await setup();
  assert.equal((await t.request("GET", "/api/admin/topups")).status, 401);
  assert.equal((await t.request("POST", "/api/admin/topups/now", { body: {} })).status, 401);
});

test("pool-skew has a row per Collection with remaining Copies, Rare+ %, thresholds, history and sold-out Cards", async () => {
  const admin = await setup();
  rarePlus(5);
  remaining("c1", 0);
  await t.request("POST", "/api/admin/topups/now", { cookie: admin, body: { collectionId: "test", rare: 1, epic: 0 } });
  const body = (await t.request("GET", "/api/admin/pool-skew", { cookie: admin })).body;
  assert.deepEqual(body.thresholds, { trigger: 0.03, target: 0.07 });
  assert.equal(body.collections.length, 1);
  const row = body.collections[0];
  assert.equal(row.collectionId, "test");
  assert.equal(row.remaining.rare, 6);
  assert.equal(row.remaining.common, 100);
  assert.ok(Math.abs(row.rarePlusShare - 6 / 106) < 1e-9);
  assert.equal(row.topUps.length, 1);
  assert.deepEqual(row.soldOutCards.map((c) => c.cardId).sort(), ["c1", "e1", "l1", "r2"]);
});

test("the admin overview has banners for a pending Top-up, a fired Top-up and a sold-out Rarity", async () => {
  const admin = await setup();
  rarePlus(5, 0, 0); // epic and legendary sold out
  await pending(admin);
  await t.request("POST", "/api/admin/topups/now", { cookie: admin, body: { collectionId: "test", rare: 1, epic: 0 } });
  const kinds = (await t.request("GET", "/api/admin/overview", { cookie: admin })).body.banners.map((b) => b.kind);
  assert.ok(kinds.includes("topup_pending"));
  assert.ok(kinds.includes("topup_fired"));
  assert.ok(kinds.includes("rarity_sold_out"));
});
