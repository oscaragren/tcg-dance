import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./harness.mjs";

let t;
afterEach(() => t.close());

function give(player, cardId, copies) {
  for (let i = 0; i < copies; i++) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(player.userId, cardId);
}
const propose = (from, to, body) =>
  t.request("POST", "/api/trade", { cookie: from.cookie, body: { receiverUserId: to.userId, ...body } });
const trades = async (who) => (await t.request("GET", "/api/trade", { cookie: who.cookie })).body;

// Test catalog: c1, c2 (common), r1 (rare), l1 (legendary).
test("each Copy is marked Ny! or Har redan (×N) for whoever receives it", async () => {
  t = await startTestApp();
  const alice = await t.registerPlayer();
  const bob = await t.registerPlayer();
  give(alice, "c1", 1); give(alice, "r1", 1);
  give(bob, "r1", 2); give(bob, "c2", 1);
  assert.equal((await propose(alice, bob, { offeredCardIds: ["c1", "r1"], requestedCardIds: ["c2", "r1"] })).status, 201);
  const [trade] = await trades(bob);
  // Bob receives alice's offer: c1 is new to him, he already has 2 of r1.
  assert.deepEqual(trade.offeredCopies.map((c) => [c.cardId, c.recipientOwned, c.isNew]), [["c1", 0, true], ["r1", 2, false]]);
  // Alice receives what she asked for: she has no c2, and already has 1 r1.
  assert.deepEqual(trade.requestedCopies.map((c) => [c.cardId, c.recipientOwned, c.isNew]), [["c2", 0, true], ["r1", 1, false]]);
});

test("asking for a Copy that is not Available for Trade is allowed and flagged Inte till byte", async () => {
  t = await startTestApp();
  const alice = await t.registerPlayer();
  const bob = await t.registerPlayer();
  give(alice, "c1", 1);
  give(bob, "c2", 3); // 2 available
  give(bob, "r1", 1); // single Copy: not available
  const res = await propose(alice, bob, { offeredCardIds: ["c1"], requestedCardIds: ["c2", "c2", "c2", "r1"] });
  assert.equal(res.status, 201);
  const [trade] = await trades(alice);
  assert.deepEqual(trade.requestedCopies.map((c) => c.notForTrade), [false, false, true, true]);
  assert.ok(trade.offeredCopies.every((c) => c.notForTrade === undefined));
});

test("Rarity totals per side", async () => {
  t = await startTestApp();
  const alice = await t.registerPlayer();
  const bob = await t.registerPlayer();
  give(alice, "c1", 2); give(alice, "r1", 1);
  give(bob, "l1", 1);
  await propose(alice, bob, { offeredCardIds: ["c1", "c1", "r1"], requestedCardIds: ["l1"] });
  const [trade] = await trades(alice);
  assert.deepEqual(trade.offeredRarity, { common: 2, rare: 1 });
  assert.deepEqual(trade.requestedRarity, { legendary: 1 });
});

test("Diamonds have no cap beyond what the sender holds, and an uneven Trade is not blocked", async () => {
  t = await startTestApp();
  const alice = await t.registerPlayer();
  const bob = await t.registerPlayer();
  give(bob, "l1", 1);
  const state = await t.request("GET", "/api/game/state", { cookie: alice.cookie });
  const diamonds = state.body.diamonds;
  assert.ok(diamonds > 0);
  // Everything I have for a Legendary: lopsided, still accepted as a proposal.
  assert.equal((await propose(alice, bob, { offeredDiamonds: diamonds, requestedCardIds: ["l1"] })).status, 201);
  // Diamonds on both sides, nothing else.
  assert.equal((await propose(alice, bob, { offeredDiamonds: 1, requestedDiamonds: 5000 })).status, 201);
});

test("the public market endpoints are gone, but Hitta byte's who-has-this-Card lookup stays", async () => {
  t = await startTestApp();
  const me = await t.registerPlayer();
  const gone = await fetch(`${t.baseUrl}/api/market/traders`, { headers: { cookie: me.cookie } });
  assert.equal(gone.status, 404);
  assert.equal((await t.request("GET", "/api/market/card/c1", { cookie: me.cookie })).status, 200);
});
