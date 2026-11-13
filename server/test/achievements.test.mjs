import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, TEST_CATALOG } from "./harness.mjs";

// 3 Commons, 2 Rares, 1 Epic, 1 Legendary, 1 Special → 7 non-Special Cards.
const cards = [
  ...["c1", "c2", "c3"].map((id) => ({ id, collectionId: "ach", rarity: "common", name: id })),
  ...["r1", "r2"].map((id) => ({ id, collectionId: "ach", rarity: "rare", name: id })),
  { id: "e1", collectionId: "ach", rarity: "epic", name: "e1" },
  { id: "l1", collectionId: "ach", rarity: "legendary", name: "l1" },
  { id: "s1", collectionId: "ach", rarity: "special", name: "s1" },
  // A second Collection with the very same table, to prove it is shared.
  { id: "o1", collectionId: "other", rarity: "common", name: "o1" },
  { id: "o2", collectionId: "other", rarity: "rare", name: "o2" },
];
const catalog = {
  ...TEST_CATALOG,
  cards,
  collections: [
    { id: "ach", label: "Ach", pack: { label: "Ach pack", cardCount: 2, price: 100 } },
    // An old per-collection custom table must be ignored.
    { id: "other", label: "Other", pack: { label: "Other pack", cardCount: 2, price: 100 }, achievements: { packsOpened: [{ target: 1, reward: 10 }] } },
  ],
};

let t, player;
beforeEach(async () => { t = await startTestApp({ catalog }); player = await t.registerPlayer(); });
afterEach(() => t.close());

const list = async () => (await t.request("GET", "/api/achievements", { cookie: player.cookie })).body;
const find = async (id) => (await list()).find((a) => a.id === id);
const diamonds = async () => (await t.request("GET", "/api/game/state", { cookie: player.cookie })).body.diamonds;
const claim = (id) => t.request("POST", `/api/achievements/${id}/claim`, { cookie: player.cookie });
const give = (...ids) => {
  for (const id of ids) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(player.userId, id);
};
const forCollection = async (id) => (await list()).filter((a) => a.collectionId === id);

test("every Collection gets the same table of Achievements", async () => {
  const shape = async (id) => (await forCollection(id)).map((a) => a.id.replace(id, "X")).sort();
  const ach = await shape("ach");
  assert.deepEqual(ach.filter((i) => i.includes("first")), ["collection-first-X-epic", "collection-first-X-legendary", "collection-first-X-rare"]);
  assert.ok(!(await list()).some((a) => a.id.includes("packs")), "no Packs opened Achievements");
  const other = await shape("other");
  assert.deepEqual(other, ["collection-complete-X", "collection-first-X-rare", "collection-rarity-X-common-all", "collection-rarity-X-rare-all"]);
});

test("rewards: first Rare/Epic/Legendary 50/150/500, every Common/Rare/Epic/Legendary 500/1000/2000/3000, Full Collection 5000", async () => {
  const rewards = Object.fromEntries((await forCollection("ach")).map((a) => [a.id, a.reward]));
  assert.deepEqual(rewards, {
    "collection-first-ach-rare": 50, "collection-first-ach-epic": 150, "collection-first-ach-legendary": 500,
    "collection-rarity-ach-common-all": 500, "collection-rarity-ach-rare-all": 1000,
    "collection-rarity-ach-epic-all": 2000, "collection-rarity-ach-legendary-all": 3000,
    "collection-complete-ach": 5000,
  });
});

test("first Rare: reachable and claimable once", async () => {
  assert.equal((await claim("collection-first-ach-rare")).status, 400);
  give("r2");
  const a = await find("collection-first-ach-rare");
  assert.equal(a.complete, true);
  const before = await diamonds();
  const res = await claim("collection-first-ach-rare");
  assert.equal(res.status, 200);
  assert.equal(res.body.diamondsAwarded, 50);
  assert.equal(await diamonds(), before + 50);
  assert.equal((await claim("collection-first-ach-rare")).status, 400);
  assert.equal((await find("collection-first-ach-rare")).claimed, true);
});

test("first Epic and first Legendary", async () => {
  give("e1", "l1");
  assert.equal((await claim("collection-first-ach-epic")).body.diamondsAwarded, 150);
  assert.equal((await claim("collection-first-ach-legendary")).body.diamondsAwarded, 500);
});

test("every Card of a Rarity needs all of them", async () => {
  give("c1", "c2");
  assert.equal((await find("collection-rarity-ach-common-all")).complete, false);
  assert.equal((await claim("collection-rarity-ach-common-all")).status, 400);
  give("c3");
  assert.equal((await claim("collection-rarity-ach-common-all")).body.diamondsAwarded, 500);
  give("r1", "r2");
  assert.equal((await claim("collection-rarity-ach-rare-all")).body.diamondsAwarded, 1000);
  give("e1");
  assert.equal((await claim("collection-rarity-ach-epic-all")).body.diamondsAwarded, 2000);
  give("l1");
  assert.equal((await claim("collection-rarity-ach-legendary-all")).body.diamondsAwarded, 3000);
});

test("no Special Achievements, and Special is left out of Full Collection", async () => {
  assert.ok(!(await list()).some((a) => a.id.includes("special")));
  give("c1", "c2", "c3", "r1", "r2", "e1");
  assert.equal((await claim("collection-complete-ach")).status, 400);
  give("l1"); // every non-Special Card, still no s1
  const full = await find("collection-complete-ach");
  assert.equal(full.target, 7);
  assert.equal(full.complete, true);
  assert.equal((await claim("collection-complete-ach")).body.diamondsAwarded, 5000);
});

test("unique-Card milestones below the Collection size, counting only non-Special Cards", async () => {
  const unique = (await forCollection("ach")).filter((a) => a.id.startsWith("collection-unique-"));
  assert.deepEqual(unique, []); // 7 Cards: the 10+ milestones don't apply
  assert.ok(!(await list()).some((a) => a.id.startsWith("unique-")), "no global ones");
});

test("unique-Card milestones exist for a big Collection", async () => {
  await t.close();
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, collectionId: "big", rarity: "common", name: `m${i}` }));
  t = await startTestApp({ catalog: { ...catalog, cards: [...cards, ...many], collections: [...catalog.collections, { id: "big", label: "Big", pack: { label: "Big pack", cardCount: 2, price: 100 } }] } });
  player = await t.registerPlayer();
  const ids = (await forCollection("big")).filter((a) => a.id.startsWith("collection-unique-")).map((a) => [a.target, a.reward]);
  assert.deepEqual(ids, [[10, 5], [25, 10]]);
  give(...many.slice(0, 10).map((c) => c.id));
  assert.equal((await claim("collection-unique-big-10")).status, 200);
});

test("old Achievements are unknown", async () => {
  assert.equal((await claim("collection-packs-other-1")).status, 404);
  assert.equal((await claim("collection-rarity-ach-rare-1")).status, 404);
});

test("a claim is logged as its own Diamond source", async () => {
  give("r1");
  await claim("collection-first-ach-rare");
  const rows = t.db.prepare("SELECT type, collection_id, diamonds FROM game_events WHERE user_id = ? AND type = 'achievement'").all(player.userId);
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ type: "achievement", collection_id: "ach", diamonds: 50 }]);
});

test("claimable Achievements appear in Väntar på dig", async () => {
  give("r1");
  const waiting = (await t.request("GET", "/api/game/waiting", { cookie: player.cookie })).body;
  assert.ok(JSON.stringify(waiting).includes("collection-first-ach-rare"));
});
