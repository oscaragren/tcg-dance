import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { seededRandom, startTestApp, TEST_CATALOG } from "./harness.mjs";

let t;
afterEach(() => t.close());

// One Copy of every Card: 4 Copies in total, buying 5 Packs empties it.
const SCARCE = { ...TEST_CATALOG, copiesPerRarity: { common: 1, rare: 1, epic: 1, legendary: 1, special: 1 } };

async function setup(catalog = SCARCE) {
  t = await startTestApp({ random: seededRandom([0]), catalog });
  return t.registerPlayer();
}
const buy = (player, quantity = 1) =>
  t.request("POST", "/api/game/buy-pack", { cookie: player.cookie, body: { collectionId: "test", quantity } });

test("buying a Pack from a Collection with no Copies left is refused and costs nothing", async () => {
  const player = await setup();
  assert.equal((await buy(player, 5)).status, 200); // 10 draws against 4 Copies: the whole pool
  const before = (await t.request("GET", "/api/game/state", { cookie: player.cookie })).body.diamonds;

  const res = await buy(player);
  assert.equal(res.status, 400);
  assert.match(res.body.message, /Slutsålt/);
  const after = (await t.request("GET", "/api/game/state", { cookie: player.cookie })).body.diamonds;
  assert.equal(after, before);
});

test("a Collection reports soldOut once its pool is empty, without any counts", async () => {
  const player = await setup();
  const availability = async () => (await t.request("GET", "/api/game/availability")).body;

  assert.equal((await availability()).test.soldOut, false);
  await buy(player, 5);
  assert.equal((await availability()).test.soldOut, true);
});

test("availability reports which Rarities still have Copies, as booleans", async () => {
  const player = await setup();
  const { body } = await t.request("GET", "/api/game/availability");
  assert.deepEqual(body.test.rarityInStock, { common: true, rare: true, legendary: true });
  await buy(player, 5);
  const after = (await t.request("GET", "/api/game/availability")).body;
  assert.deepEqual(after.test.rarityInStock, { common: false, rare: false, legendary: false });
});

test("no player-facing response exposes remaining pool counts", async () => {
  const player = await setup(TEST_CATALOG);
  assert.equal((await fetch(`${t.baseUrl}/api/game/pool`)).status, 404);
  const text = JSON.stringify([
    (await t.request("GET", "/api/game/availability")).body,
    (await t.request("GET", "/api/game/collections")).body,
    (await t.request("GET", "/api/game/state", { cookie: player.cookie })).body,
  ]);
  assert.doesNotMatch(text, /copiesRemaining|totalCopies|remaining/i);
});

test("admin keeps the pool counts", async () => {
  await setup(TEST_CATALOG);
  const login = await t.request("POST", "/api/admin/login", { body: { password: "admin-pw" } });
  const cookie = login.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  const res = await t.request("GET", "/api/admin/pool", { cookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.find((r) => r.cardId === "c1").remaining, 10);
});
