import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { seededRandom, startTestApp } from "./harness.mjs";

let t, player;
async function setup(random) {
  t = await startTestApp({ random });
  player = await t.registerPlayer();
}
afterEach(() => t.close());

const buy = (quantity = 1) =>
  t.request("POST", "/api/game/buy-pack", { cookie: player.cookie, body: { collectionId: "test", quantity } });
const pool = async () => (await t.request("GET", "/api/game/pool")).body;

// Pool at start (ordered by card_id): c1 x10, c2 x10, l1 x1, r1 x5 = 26 copies.
// A draw of random()=r picks copy floor(r * total) in that order.

test("buying a pack costs its price and yields cardCount Copies", async () => {
  await setup(seededRandom([0]));
  const res = await buy();
  assert.equal(res.status, 200);
  assert.equal(res.body.pulledCards.length, 2);
  assert.equal(res.body.state.diamonds, 400); // 500 - 100
  assert.equal(res.body.state.ownedCardIds.length, 2);
});

test("Copies come from the Card pool according to the seeded random source", async () => {
  // 0 -> first copy (c1); 0.99 -> last copy of 25 left (r1)
  await setup(seededRandom([0, 0.99]));
  const res = await buy();
  assert.deepEqual(res.body.pulledCards.map((c) => c.id), ["c1", "r1"]);

  const p = await pool();
  assert.equal(p.c1.copiesRemaining, 9);
  assert.equal(p.r1.copiesRemaining, 4);
  assert.equal(p.c2.copiesRemaining, 10);
});

test("a rare copy is weighted by remaining copies: legendary sits between c2 and r1", async () => {
  // Index 20 of 26 (c1:0-9, c2:10-19, l1:20, r1:21-25) is the single legendary.
  await setup(seededRandom([20 / 26 + 0.001, 0]));
  const res = await buy();
  assert.equal(res.body.pulledCards[0].id, "l1");
  assert.equal((await pool()).l1.copiesRemaining, 0);
});

test("the same seed gives the same pull", async () => {
  await setup(seededRandom([0.3, 0.6]));
  const a = (await buy()).body.pulledCards.map((c) => c.id);
  await t.close();
  await setup(seededRandom([0.3, 0.6]));
  const b = (await buy()).body.pulledCards.map((c) => c.id);
  assert.deepEqual(a, b);
});

test("buying 5 packs charges 5x the price", async () => {
  await setup(seededRandom([0]));
  const res = await buy(5);
  assert.equal(res.status, 200);
  assert.equal(res.body.pulledCards.length, 10); // 5 packs x 2 cards
  assert.equal(res.body.state.diamonds, 0); // 500 - 5 x 100
});

test("insufficient diamonds is refused and nothing is drawn", async () => {
  await setup(seededRandom([0]));
  assert.equal((await buy(10)).status, 400); // 1000 > 500
  const p = await pool();
  assert.equal(p.c1.copiesRemaining, 10);
});

test("an invalid quantity is refused", async () => {
  await setup(seededRandom([0]));
  assert.equal((await buy(3)).status, 400);
});
