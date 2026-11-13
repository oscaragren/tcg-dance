import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, TEST_CATALOG } from "./harness.mjs";

let t;
afterEach(() => t.close());

async function setup(catalog = TEST_CATALOG) {
  t = await startTestApp({ catalog });
  return { owner: await t.registerPlayer(), viewer: await t.registerPlayer() };
}
function give(player, cardId, copies) {
  for (let i = 0; i < copies; i++) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(player.userId, cardId);
}
const keep = (player, cardId, keepIt) =>
  t.request("PUT", `/api/game/keep/${cardId}`, { cookie: player.cookie, body: { keep: keepIt } });
const theirCards = async (owner, viewer) =>
  (await t.request("GET", `/api/users/${owner.userId}/cards-for-trade`, { cookie: viewer.cookie })).body.cards;

test("one Copy is never Available for Trade", async () => {
  const { owner, viewer } = await setup();
  give(owner, "c1", 1);
  assert.deepEqual(await theirCards(owner, viewer), []);
});

test("three Copies make two Available for Trade", async () => {
  const { owner, viewer } = await setup();
  give(owner, "c1", 3);
  assert.deepEqual(await theirCards(owner, viewer), [{ cardId: "c1", quantity: 2 }]);
});

test("Behåll on a Card with three Copies makes none Available for Trade", async () => {
  const { owner, viewer } = await setup();
  give(owner, "c1", 3);
  assert.equal((await keep(owner, "c1", true)).status, 200);
  assert.deepEqual(await theirCards(owner, viewer), []);
  assert.equal((await keep(owner, "c1", false)).status, 200);
  assert.deepEqual(await theirCards(owner, viewer), [{ cardId: "c1", quantity: 2 }]);
});

test("a Special card is never Available for Trade", async () => {
  const withSpecial = { ...TEST_CATALOG, cards: [...TEST_CATALOG.cards, { id: "s1", collectionId: "test", rarity: "special", name: "S1" }] };
  const { owner, viewer } = await setup(withSpecial);
  give(owner, "s1", 2); // even a (data-fix) second Copy stays unlisted
  assert.deepEqual(await theirCards(owner, viewer), []);
});

test("Hitta byte and the profile use the derived availability", async () => {
  const { owner, viewer } = await setup();
  give(owner, "c1", 3);
  give(owner, "c2", 1);
  const card = (await t.request("GET", "/api/market/card/c1", { cookie: viewer.cookie })).body.traders;
  assert.equal(card[0].quantity, 2);
  const profile = (await t.request("GET", `/api/users/${owner.userId}/profile`, { cookie: viewer.cookie })).body;
  assert.deepEqual(profile.cardsForTrade, [{ cardId: "c1", quantity: 2 }]);
});

test("a banned player's Available cards are hidden from others", async () => {
  const { owner, viewer } = await setup();
  give(owner, "c1", 3);
  t.db.prepare("UPDATE users SET banned_until = ? WHERE id = ?").run(new Date(t.clock.now() + 86400000).toISOString(), owner.userId);
  assert.deepEqual(await theirCards(owner, viewer), []);
});

test("my own state reports which Cards are set to Behåll; manual marks can no longer be saved", async () => {
  const { owner } = await setup();
  give(owner, "c1", 3);
  await keep(owner, "c1", true);
  const state = (await t.request("GET", "/api/game/state", { cookie: owner.cookie })).body;
  assert.deepEqual(state.keptCardIds, ["c1"]);
  const save = await fetch(`${t.baseUrl}/api/game/cards-for-trade`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: owner.cookie },
    body: JSON.stringify({ items: [{ cardId: "c1", quantity: 1 }] }),
  });
  assert.equal(save.status, 404);
});

test("Behåll can only be set on a Card the player owns", async () => {
  const { owner } = await setup();
  assert.equal((await keep(owner, "c1", true)).status, 400);
});
