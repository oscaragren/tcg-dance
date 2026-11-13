import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { TEST_CATALOG, startTestApp } from "./harness.mjs";

const card = (id, rarity, collectionId = "test") => ({ id, collectionId, rarity, name: id });
const CATALOG = {
  ...TEST_CATALOG,
  cards: [
    card("c1", "common"), card("c2", "common"), card("c3", "common"), card("c4", "common"),
    card("r1", "rare"), card("r2", "rare"),
    card("e1", "epic"), card("e2", "epic"),
    card("l1", "legendary"), card("l2", "legendary"),
    card("s1", "special"),
    card("o1", "common", "other"),
  ],
  collections: [
    ...TEST_CATALOG.collections,
    { id: "other", label: "Other", pack: { label: "Other pack", cardCount: 2, price: 100 } },
  ],
};

let t;
beforeEach(async () => { t = await startTestApp({ catalog: CATALOG }); });
afterEach(() => t.close());

const give = (userId, ...cardIds) => {
  for (const id of cardIds) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(userId, id);
};
const board = async (who) => (await t.request("GET", "/api/leaderboard", { cookie: who.cookie })).body;
const order = (entries) => entries.map((e) => e.username);

test("requires login", async () => {
  assert.equal((await t.request("GET", "/api/leaderboard")).status, 401);
});

test("ranks by unique Cards, not Copies", async () => {
  const a = await t.registerPlayer(); // many Copies of one Card
  const b = await t.registerPlayer(); // two different Cards
  give(a.userId, "c1", "c1", "c1", "c1", "c1");
  give(b.userId, "c1", "c2");
  const entries = await board(a);
  assert.deepEqual(order(entries), [b.username, a.username]);
  assert.deepEqual(entries.map((e) => e.total), [2, 1]);
  assert.deepEqual(entries.map((e) => e.points), [2, 1]);
});

test("scores Common 1, Rare 5, Epic 10, Legendary 20 and leaves Special out", async () => {
  const a = await t.registerPlayer();
  give(a.userId, "c1", "c2", "r1", "e1", "l1", "s1");
  const [entry] = await board(a);
  assert.equal(entry.points, 1 + 1 + 5 + 10 + 20);
  assert.equal(entry.total, 5);
});

test("a rare+ Card outranks several Commons", async () => {
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  give(a.userId, "c1", "c2", "c3", "c4"); // 4 points
  give(b.userId, "r1"); // 5 points
  assert.deepEqual(order(await board(a)), [b.username, a.username]);
});

test("counts unique Cards across all Collections and leaves Special out", async () => {
  const a = await t.registerPlayer();
  give(a.userId, "c1", "o1", "s1");
  const [entry] = await board(a);
  assert.equal(entry.total, 2);
});

test("ties break on unique Legendary", async () => {
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  give(a.userId, "e1", "e2"); // 20 points, 0 legendary
  give(b.userId, "l1"); // 20 points, 1 legendary
  assert.deepEqual(order(await board(a)), [b.username, a.username]);
});

test("then on unique Epic", async () => {
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  give(a.userId, "r1", "r2"); // 10 points, 0 epic
  give(b.userId, "e1"); // 10 points, 1 epic
  assert.deepEqual(order(await board(a)), [b.username, a.username]);
});

test("then on unique Rare", async () => {
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  give(a.userId, "c1", "c2", "c3", "c4", "o1"); // 5 points, 0 rare
  give(b.userId, "r1"); // 5 points, 1 rare
  assert.deepEqual(order(await board(a)), [b.username, a.username]);
});

test("Copies never break a tie", async () => {
  const a = await t.registerPlayer();
  const b = await t.registerPlayer();
  give(a.userId, "l1", "l1", "l1");
  give(b.userId, "l1");
  const entries = await board(a);
  assert.deepEqual(entries.map((e) => e.rank), [1, 1]);
});

test("players still tied after every tie-break share the rank", async () => {
  const [a, b, c, d] = [await t.registerPlayer(), await t.registerPlayer(), await t.registerPlayer(), await t.registerPlayer()];
  give(a.userId, "l1", "l2"); // 2
  give(b.userId, "c1", "c2"); // 2, no legendary
  give(c.userId, "c3", "c4"); // 2, same as b
  give(d.userId, "c1"); // 1
  const entries = await board(a);
  assert.deepEqual(entries.map((e) => e.rank), [1, 2, 2, 4]);
  assert.equal(entries[0].username, a.username);
  assert.equal(entries[3].username, d.username);
});
