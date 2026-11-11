import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, TEST_CATALOG } from "./harness.mjs";

let t;
afterEach(() => t.close());

function give(player, cardId, copies) {
  for (let i = 0; i < copies; i++) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(player.userId, cardId);
}
const matches = async (me) => (await t.request("GET", "/api/market/matches", { cookie: me.cookie })).body.matches;

// Test catalog: c1, c2 (common), r1 (rare), l1 (legendary).
test("two-way matches come first, then by how many of my Missing Cards they have available", async () => {
  t = await startTestApp();
  const me = await t.registerPlayer();
  const oneWay = await t.registerPlayer(); // has 2 of my Missing Cards, wants nothing I have spare
  const twoWay = await t.registerPlayer(); // has 1 of my Missing Cards, and lacks a Card I have spare
  give(me, "c1", 2); // I have c1 spare; I miss c2, r1, l1
  give(oneWay, "c1", 1); give(oneWay, "c2", 2); give(oneWay, "r1", 2);
  give(twoWay, "l1", 3); give(twoWay, "c2", 1);
  const list = await matches(me);
  assert.deepEqual(list.map((m) => [m.userId, m.twoWay]), [[twoWay.userId, true], [oneWay.userId, false]]);
  assert.deepEqual(list[1].theyCanGive.map((c) => c.cardId).sort(), ["c2", "r1"]);
  assert.deepEqual(list[0].youCanGive, [{ cardId: "c1", quantity: 1 }]);
});

test("among the same kind of match, more of my Missing Cards ranks higher", async () => {
  t = await startTestApp();
  const me = await t.registerPlayer();
  const few = await t.registerPlayer();
  const many = await t.registerPlayer();
  give(few, "c1", 2);
  give(many, "c1", 2); give(many, "c2", 2);
  const list = await matches(me);
  assert.deepEqual(list.map((m) => m.userId), [many.userId, few.userId]);
});

test("only Available Copies count: a single Copy or a Behåll Card is not a match", async () => {
  t = await startTestApp();
  const me = await t.registerPlayer();
  const other = await t.registerPlayer();
  give(other, "c1", 1);
  give(other, "c2", 3);
  await t.request("PUT", "/api/game/keep/c2", { cookie: other.cookie, body: { keep: true } });
  assert.deepEqual(await matches(me), []);
});

test("Cards I own are not Missing, and banned players are left out", async () => {
  t = await startTestApp();
  const me = await t.registerPlayer();
  const other = await t.registerPlayer();
  give(me, "c1", 1);
  give(other, "c1", 3);
  assert.deepEqual(await matches(me), []);
  give(other, "c2", 3);
  t.db.prepare("UPDATE users SET banned_until = ? WHERE id = ?").run(new Date(t.clock.now() + 86400000).toISOString(), other.userId);
  assert.deepEqual(await matches(me), []);
});

test("who has this Card available: Available Copies only, excluding me, most Copies first", async () => {
  t = await startTestApp();
  const me = await t.registerPlayer();
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  const single = await t.registerPlayer();
  give(a, "c1", 2); give(b, "c1", 4); give(single, "c1", 1); give(me, "c1", 3);
  const res = (await t.request("GET", "/api/market/card/c1", { cookie: me.cookie })).body;
  assert.deepEqual(res.traders.map((x) => [x.userId, x.quantity]), [[b.userId, 3], [a.userId, 1]]);
});
