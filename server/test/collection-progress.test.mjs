import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { TEST_CATALOG, startTestApp } from "./harness.mjs";

// Two collections; "test" has a Special card, "other" has none.
const CATALOG = {
  ...TEST_CATALOG,
  cards: [
    { id: "c1", collectionId: "test", rarity: "common", name: "C1" },
    { id: "c2", collectionId: "test", rarity: "common", name: "C2" },
    { id: "r1", collectionId: "test", rarity: "rare", name: "R1" },
    { id: "s1", collectionId: "test", rarity: "special", name: "S1" },
    { id: "o1", collectionId: "other", rarity: "epic", name: "O1" },
  ],
  collections: [
    ...TEST_CATALOG.collections,
    { id: "other", label: "Other", pack: { label: "Other pack", cardCount: 2, price: 100 } },
  ],
};

let t, player;
beforeEach(async () => {
  t = await startTestApp({ catalog: CATALOG });
  player = await t.registerPlayer();
});
afterEach(() => t.close());

const give = (userId, ...cardIds) => {
  for (const id of cardIds) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(userId, id);
};
const progress = (query = "", who = player) =>
  t.request("GET", `/api/game/collection-progress${query}`, { cookie: who.cookie });

test("requires login", async () => {
  assert.equal((await t.request("GET", "/api/game/collection-progress")).status, 401);
});

test("counts unique Cards owned, in total and per Rarity", async () => {
  give(player.userId, "c1", "c1", "c1", "r1");
  const { status, body } = await progress("?collectionId=test");
  assert.equal(status, 200);
  assert.equal(body.collectionId, "test");
  assert.deepEqual(body.total, { owned: 2, total: 3 });
  assert.deepEqual(body.byRarity.common, { owned: 1, total: 2 });
  assert.deepEqual(body.byRarity.rare, { owned: 1, total: 1 });
  assert.deepEqual(body.byRarity.epic, { owned: 0, total: 0 });
});

test("Special cards never count, owned or not", async () => {
  give(player.userId, "s1");
  const { body } = await progress("?collectionId=test");
  assert.deepEqual(body.total, { owned: 0, total: 3 });
  assert.equal("special" in body.byRarity, false);
});

test("without a collectionId it covers every Collection", async () => {
  give(player.userId, "c1", "o1", "s1");
  const { body } = await progress();
  assert.equal(body.collectionId, null);
  assert.deepEqual(body.total, { owned: 2, total: 4 });
  assert.deepEqual(body.byRarity.epic, { owned: 1, total: 1 });
});

test("progress is per player", async () => {
  const other = await t.registerPlayer();
  give(other.userId, "c1", "c2");
  const { body } = await progress("?collectionId=test");
  assert.equal(body.total.owned, 0);
});

test("an unknown Collection is a 404", async () => {
  assert.equal((await progress("?collectionId=nope")).status, 404);
});

test("trophies list each Special card with its owner, or null", async () => {
  const other = await t.registerPlayer();
  let res = await t.request("GET", "/api/game/trophies", { cookie: player.cookie });
  assert.deepEqual(res.body, [{ cardId: "s1", collectionId: "test", owner: null }]);

  give(other.userId, "s1");
  res = await t.request("GET", "/api/game/trophies", { cookie: player.cookie });
  assert.equal(res.body[0].owner.username, "p2");
  assert.equal(res.body[0].owner.isYou, false);

  res = await t.request("GET", "/api/game/trophies", { cookie: other.cookie });
  assert.equal(res.body[0].owner.isYou, true);
});
