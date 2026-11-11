import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeClock, startTestApp } from "./harness.mjs";

let t, clock, admin, alice, bob;
beforeEach(async () => {
  clock = fakeClock("2026-03-10T12:00:00+01:00");
  t = await startTestApp({ clock });
  admin = await t.adminCookie();
  alice = await t.registerPlayer();
  bob = await t.registerPlayer();
});
afterEach(() => t.close());

const post = (path, who, body) => t.request("POST", path, { cookie: who.cookie ?? who, body });
const flow = async (days = 7) => (await t.request("GET", `/api/admin/diamond-flow?days=${days}`, { cookie: admin })).body;
const today = (f) => f.days.find((d) => d.date === "2026-03-10");
const fund = (p, n) => t.db.prepare("UPDATE player_state SET diamonds = ? WHERE user_id = ?").run(n, p.userId);

test("requires admin", async () => {
  assert.equal((await t.request("GET", "/api/admin/diamond-flow")).status, 401);
});

test("lists every source and sink per day for a seeded set of actions", async () => {
  fund(alice, 1000);
  await post("/api/game/claim-daily-diamonds", alice);              // +150 daily
  await post("/api/game/buy-pack", alice, { collectionId: "test", quantity: 1 }); // -100 packs
  await post("/api/game/chests/buy", alice, { type: "bronze" });    // -10 chests
  await post("/api/game/chests/buy-slot", alice, { type: "bronze" }); // slots
  // Streak: 7th claim pays the bonus
  t.db.prepare("UPDATE player_state SET diamond_streak = 6 WHERE user_id = ?").run(bob.userId);
  await post("/api/game/claim-daily-diamonds", bob);                // +150 daily, +streak bonus
  const f = await flow();
  const d = today(f);
  assert.equal(d.sources.daily, 300);
  assert.ok(d.sources.streak > 0);
  assert.equal(d.sinks.packs, 100);
  assert.equal(d.sinks.chests, 10);
  assert.ok(d.sinks.slots > 0);
  for (const k of ["daily", "streak", "weeklyGoals", "achievements", "chestPayouts", "eventGifts", "adminGrants"]) {
    assert.equal(typeof d.sources[k], "number", k);
  }
  assert.equal(f.totals.sources.daily, 300);
  assert.equal(f.totals.sinks.packs, 100);
});

test("shows Diamonds earned per active player per day against the 300 target", async () => {
  await post("/api/game/claim-daily-diamonds", alice);
  await post("/api/game/claim-daily-diamonds", bob);
  const f = await flow();
  assert.equal(f.target, 300);
  const d = today(f);
  assert.equal(d.activePlayers, 2);
  assert.equal(d.earnedPerActivePlayer, 150);
});

test("Trade Diamonds are shown separately and are not counted as earned or spent", async () => {
  fund(alice, 500);
  t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, 'r1')").run(bob.userId);
  const sent = await post("/api/trade", alice, { receiverUserId: bob.userId, offeredCardIds: [], requestedCardIds: ["r1"], offeredDiamonds: 120 });
  assert.ok(sent.status < 300, JSON.stringify(sent.body));
  const acc = await post(`/api/trade/${sent.body.tradeId}/accept`, bob);
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
  const f = await flow();
  const d = today(f);
  assert.equal(d.tradeDiamonds, 120);
  assert.equal(f.totals.tradeDiamonds, 120);
  assert.equal(d.earned, 0);
  assert.equal(Object.values(d.sinks).reduce((a, b) => a + b, 0), 0);
});

test("a grant requires a reason, adds Diamonds, is its own source and shows in the player's history", async () => {
  const noReason = await post(`/api/admin/users/${alice.userId}/grant-diamonds`, admin, { amount: 50, reason: "  " });
  assert.equal(noReason.status, 400);
  assert.equal((await post(`/api/admin/users/${alice.userId}/grant-diamonds`, admin, { amount: 0, reason: "x" })).status, 400);
  assert.equal((await post(`/api/admin/users/${alice.userId}/grant-diamonds`, admin, { amount: -5, reason: "x" })).status, 400);

  const before = t.db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(alice.userId).diamonds;
  const ok = await post(`/api/admin/users/${alice.userId}/grant-diamonds`, admin, { amount: 50, reason: "Bug compensation" });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.diamonds, before + 50);

  const d = today(await flow());
  assert.equal(d.sources.adminGrants, 50);

  const detail = (await t.request("GET", `/api/admin/users/${alice.userId}`, { cookie: admin })).body;
  const entry = detail.diamondHistory.find((h) => h.type === "admin_grant");
  assert.equal(entry.diamonds, 50);
  assert.equal(entry.reason, "Bug compensation");
});

test("Copies cannot be granted", async () => {
  const res = await post(`/api/admin/users/${alice.userId}/grant-diamonds`, admin, { amount: 10, reason: "x", cardIds: ["r1"], copies: 1 });
  assert.equal(res.status, 200);
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM owned_cards WHERE user_id = ?").get(alice.userId).n, 0);
  const raw = await fetch(`${t.baseUrl}/api/admin/users/${alice.userId}/grant-copies`, { method: "POST", headers: { cookie: admin, "content-type": "application/json" }, body: "{}" });
  assert.equal(raw.status, 404);
});

test("a grant needs an admin", async () => {
  assert.equal((await post(`/api/admin/users/${alice.userId}/grant-diamonds`, alice, { amount: 5, reason: "x" })).status, 401);
});
