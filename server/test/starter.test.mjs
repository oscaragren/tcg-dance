import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeClock, startTestApp } from "./harness.mjs";

let t, clock, player;
beforeEach(async () => {
  clock = fakeClock("2026-03-10T12:00:00+01:00");
  t = await startTestApp({ clock });
  player = await t.registerPlayer();
});
afterEach(() => t.close());

const get = (path, who = player) => t.request("GET", path, { cookie: who.cookie });
const post = (path, who = player, body) => t.request("POST", path, { cookie: who.cookie, body });
const waiting = async (who = player) => (await get("/api/game/waiting", who)).body.items;
const starter = async (who = player) => (await get("/api/game/starter", who)).body;
const step = async (id, who = player) => (await starter(who)).steps.find((s) => s.id === id);

test("a new player has 500 Diamonds and the free Pack waiting first", async () => {
  assert.equal((await get("/api/game/state")).body.diamonds, 500);
  const items = await waiting();
  assert.equal(items[0].type, "starter_pack");
  assert.equal(items[0].collectionId, "test");
});

test("claiming the free Pack opens it without a Diamond cost", async () => {
  const res = await post("/api/game/starter/free-pack/claim");
  assert.equal(res.status, 200);
  assert.equal(res.body.pulledCards.length, 2);
  assert.equal(res.body.state.diamonds, 500);
  assert.equal(res.body.state.ownedCardIds.length, 2);
  assert.equal((await waiting()).some((i) => i.type === "starter_pack"), false);
});

test("the free Pack can only be claimed once", async () => {
  await post("/api/game/starter/free-pack/claim");
  assert.equal((await post("/api/game/starter/free-pack/claim")).status, 400);
  assert.equal((await get("/api/game/state")).body.ownedCardIds.length, 2);
});

test("the free Pack comes from the newest Collection on sale", async () => {
  const other = await startTestApp({
    clock,
    catalog: {
      ...(await import("./harness.mjs")).TEST_CATALOG,
      cards: [
        ...(await import("./harness.mjs")).TEST_CATALOG.cards,
        { id: "n1", collectionId: "newer", rarity: "common", name: "N1" },
      ],
      collections: [
        ...(await import("./harness.mjs")).TEST_CATALOG.collections,
        { id: "newer", label: "Newer", pack: { label: "Newer pack", cardCount: 1, price: 100 } },
        { id: "future", label: "Future", pack: { label: "F", cardCount: 1, price: 100, releaseAt: "2030-01-01T00:00:00Z" } },
      ],
    },
  });
  try {
    const p = await other.registerPlayer();
    const [item] = (await other.request("GET", "/api/game/waiting", { cookie: p.cookie })).body.items;
    assert.equal(item.collectionId, "newer");
  } finally { await other.close(); }
});

test("each Starter step is claimable once for 100 Diamonds once its action is done", async () => {
  assert.deepEqual((await starter()).steps.map((s) => [s.id, s.done, s.claimed, s.reward]), [
    ["first-pack", false, false, 100], ["daily", false, false, 100],
    ["collection", false, false, 100], ["trade", false, false, 100],
  ]);
  // Not done yet → cannot claim.
  assert.equal((await post("/api/game/starter/daily/claim")).status, 400);

  await post("/api/game/claim-daily-diamonds");
  assert.equal((await step("daily")).done, true);
  const claim = await post("/api/game/starter/daily/claim");
  assert.equal(claim.status, 200);
  assert.equal(claim.body.diamondsAwarded, 100);
  assert.equal((await step("daily")).claimed, true);
  assert.equal((await post("/api/game/starter/daily/claim")).status, 400);
  assert.equal((await get("/api/game/state")).body.diamonds, 500 + 150 + 100);
});

test("opening a Pack (free or bought) completes the first-pack step", async () => {
  await post("/api/game/starter/free-pack/claim");
  assert.equal((await step("first-pack")).done, true);
});

test("viewing the Collection completes the collection step", async () => {
  assert.equal((await step("collection")).done, false);
  await post("/api/game/starter/collection-viewed");
  assert.equal((await step("collection")).done, true);
});

test("the Trade step counts when the proposal is sent", async () => {
  const other = await t.registerPlayer();
  t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, 'c2')").run(other.userId);
  assert.equal((await step("trade")).done, false);
  await post("/api/trade", player, { receiverUserId: other.userId, offeredDiamonds: 10, requestedCardIds: ["c2"] });
  assert.equal((await step("trade")).done, true);
});

test("claimable steps appear in Väntar på dig", async () => {
  await post("/api/game/claim-daily-diamonds");
  const items = await waiting();
  const s = items.find((i) => i.type === "starter_step");
  assert.equal(s.id, "daily");
  assert.equal(s.reward, 100);
});

test("the checklist is hidden once every step is claimed", async () => {
  const other = await t.registerPlayer();
  t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, 'c2')").run(other.userId);
  await post("/api/game/starter/free-pack/claim");
  await post("/api/game/claim-daily-diamonds");
  await post("/api/game/starter/collection-viewed");
  await post("/api/trade", player, { receiverUserId: other.userId, offeredDiamonds: 10, requestedCardIds: ["c2"] });
  assert.equal((await starter()).visible, true);
  for (const id of ["first-pack", "daily", "collection", "trade"]) {
    assert.equal((await post(`/api/game/starter/${id}/claim`)).status, 200, id);
  }
  assert.equal((await starter()).visible, false);
});

test("an old account that never opened a Pack gets the free Pack and checklist", async () => {
  const old = await t.registerPlayer();
  t.db.prepare("DELETE FROM starter_state WHERE user_id = ?").run(old.userId);
  assert.equal((await waiting(old))[0].type, "starter_pack");
  assert.equal((await starter(old)).visible, true);
});

test("an account that has opened Packs gets neither the free Pack nor the checklist", async () => {
  const old = await t.registerPlayer();
  t.db.prepare("DELETE FROM starter_state WHERE user_id = ?").run(old.userId);
  t.db.prepare("INSERT INTO packs_opened (user_id, collection_id, count) VALUES (?, 'test', 3)").run(old.userId);
  assert.equal((await waiting(old)).some((i) => i.type === "starter_pack"), false);
  const s = await starter(old);
  assert.equal(s.visible, false);
  assert.equal(s.freePack, null);
  assert.equal((await post("/api/game/starter/free-pack/claim", old)).status, 400);
  assert.equal((await post("/api/game/starter/first-pack/claim", old)).status, 400);
});
