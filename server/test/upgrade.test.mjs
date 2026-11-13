import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./harness.mjs";

let t;
afterEach(() => t.close());

async function setup() {
  t = await startTestApp();
  return t.registerPlayer();
}
function give(player, cardId, copies) {
  for (let i = 0; i < copies; i++) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(player.userId, cardId);
}
const owned = (player, cardId) =>
  t.db.prepare("SELECT COUNT(*) AS n FROM owned_cards WHERE user_id = ? AND card_id = ?").get(player.userId, cardId).n;
const pool = (cardId) => t.db.prepare("SELECT copies_remaining AS n FROM card_pool WHERE card_id = ?").get(cardId).n;
const upgrade = (player, cardIds) => t.request("POST", "/api/game/upgrade", { cookie: player.cookie, body: { cardIds } });
const pick = (player, rarity) => t.request("GET", `/api/game/upgrade/pick/test/${rarity}`, { cookie: player.cookie });
const ids = (cardId, n) => Array(n).fill(cardId);

test("Rare to Epic costs 15 Duplicates; Common to Rare costs 100; Epic to Legendary 10", async () => {
  const p = await setup();
  assert.deepEqual((await pick(p, "common")).body.cost, 100);
  assert.deepEqual((await pick(p, "rare")).body.cost, 15);
  assert.deepEqual((await pick(p, "epic")).body.cost, 10);
});

test("an Upgrade at the new cost consumes the Copies, returns them to the pool and grants the next Rarity", async () => {
  const p = await setup();
  give(p, "c1", 51);
  give(p, "c2", 51);
  const poolBefore = pool("c1");
  const rareBefore = pool("r1");
  const res = await upgrade(p, [...ids("c1", 50), ...ids("c2", 50)]);
  assert.equal(res.status, 200);
  assert.equal(res.body.upgradedCard.id, "r1");
  assert.equal(owned(p, "c1"), 1);
  assert.equal(owned(p, "r1"), 1);
  assert.equal(pool("c1"), poolBefore + 50);
  assert.equal(pool("r1"), rareBefore - 1);
});

test("the old cost of 20 no longer works", async () => {
  const p = await setup();
  give(p, "c1", 30);
  const res = await upgrade(p, ids("c1", 20));
  assert.equal(res.status, 400);
  assert.equal(owned(p, "c1"), 30);
});

test("an Upgrade is refused, charging nothing, when the pool has no Copy of the next Rarity", async () => {
  const p = await setup();
  give(p, "c1", 51);
  give(p, "c2", 51);
  t.db.prepare("UPDATE card_pool SET copies_remaining = 0 WHERE rarity = 'rare'").run();
  const poolBefore = pool("c1");
  const res = await upgrade(p, [...ids("c1", 50), ...ids("c2", 50)]);
  assert.equal(res.status, 400);
  assert.equal(owned(p, "c1"), 51);
  assert.equal(owned(p, "c2"), 51);
  assert.equal(pool("c1"), poolBefore);
});

test("an Upgrade never consumes a player's only Copy", async () => {
  const p = await setup();
  give(p, "c1", 100); // 99 Duplicates...
  give(p, "c2", 1); // ...plus one only Copy
  const res = await upgrade(p, [...ids("c1", 99), "c2"]);
  assert.equal(res.status, 400);
  assert.equal(owned(p, "c1"), 100);
  assert.equal(owned(p, "c2"), 1);
});

test("an Upgrade refuses Copies of a Card set to Behåll", async () => {
  const p = await setup();
  give(p, "c1", 60);
  give(p, "c2", 60);
  await t.request("PUT", "/api/game/keep/c1", { cookie: p.cookie, body: { keep: true } });
  const res = await upgrade(p, [...ids("c1", 50), ...ids("c2", 50)]);
  assert.equal(res.status, 400);
  assert.equal(owned(p, "c1"), 60);
});

test("the automatic pick uses only Duplicates and skips Cards set to Behåll", async () => {
  const p = await setup();
  give(p, "c1", 80); // 79 Duplicates
  give(p, "c2", 61); // 60 Duplicates, but kept
  await t.request("PUT", "/api/game/keep/c2", { cookie: p.cookie, body: { keep: true } });
  let body = (await pick(p, "common")).body;
  assert.equal(body.have, 79);
  assert.equal(body.needed, 100);
  assert.equal(body.canUpgrade, false);
  assert.deepEqual(body.cardIds, ids("c1", 79)); // never c2, never the last c1

  await t.request("PUT", "/api/game/keep/c2", { cookie: p.cookie, body: { keep: false } });
  body = (await pick(p, "common")).body;
  assert.equal(body.have, 139);
  assert.equal(body.canUpgrade, true);
  assert.equal(body.cardIds.length, 100);
  assert.ok(body.cardIds.filter((id) => id === "c1").length <= 79);
  assert.ok(body.cardIds.filter((id) => id === "c2").length <= 60);

  const res = await upgrade(p, body.cardIds);
  assert.equal(res.status, 200);
});

test("the pick reports canUpgrade false when the pool has no Copy of the next Rarity", async () => {
  const p = await setup();
  give(p, "c1", 80);
  give(p, "c2", 80);
  t.db.prepare("UPDATE card_pool SET copies_remaining = 0 WHERE rarity = 'rare'").run();
  const body = (await pick(p, "common")).body;
  assert.equal(body.canUpgrade, false);
});
