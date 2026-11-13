import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeClock, startTestApp, TEST_CATALOG } from "./harness.mjs";

const DAY = 24 * 60 * 60 * 1000;
let t, clock, player;
beforeEach(async () => {
  clock = fakeClock("2026-03-10T12:00:00+01:00");
  t = await startTestApp({
    clock,
    catalog: {
      ...TEST_CATALOG,
      cards: [...TEST_CATALOG.cards, { id: "n1", collectionId: "newer", rarity: "common", name: "N1" }],
      collections: [
        ...TEST_CATALOG.collections,
        { id: "newer", label: "Newer", pack: { label: "Newer pack", cardCount: 1, price: 100, releaseAt: "2026-03-15T00:00:00+01:00" } },
      ],
      events: [{ id: "spring", label: "Våren", startsAt: "2026-03-20T00:00:00+01:00", endsAt: "2026-03-26T00:00:00+01:00" },
        { id: "old", label: "Gammal", startsAt: "2026-03-18T00:00:00+01:00", endsAt: "2026-03-19T00:00:00+01:00" }],
    },
  });
  player = await t.registerPlayer();
});
afterEach(() => t.close());

const get = (path) => t.request("GET", path, { cookie: player.cookie });
const post = (path) => t.request("POST", path, { cookie: player.cookie });
const gift = async () => (await get("/api/game/waiting")).body.items.find((i) => i.type === "comeback_gift");
const daysLater = (n) => clock.advance(n * DAY);

test("no gift for a player who is not away, or never claimed a Daily", async () => {
  assert.equal(await gift(), undefined);
  await post("/api/game/claim-daily-diamonds");
  daysLater(13);
  assert.equal(await gift(), undefined);
});

test("14 days after the last Daily claim the gift appears and pays 300 once", async () => {
  await post("/api/game/claim-daily-diamonds");
  daysLater(14);
  assert.equal((await gift()).diamonds, 300);
  const before = (await get("/api/game/state")).body.diamonds;
  const res = await post("/api/game/comeback/gift/claim");
  assert.equal(res.status, 200);
  assert.equal(res.body.state.diamonds, before + 300);
  assert.equal(await gift(), undefined);
  assert.equal((await post("/api/game/comeback/gift/claim")).status, 400);
});

test("claiming the Daily first does not lose the gift", async () => {
  await post("/api/game/claim-daily-diamonds");
  daysLater(20);
  await post("/api/game/claim-daily-diamonds");
  assert.equal((await gift()).diamonds, 300);
});

test("no second gift within 30 days, but one after 30 days", async () => {
  await post("/api/game/claim-daily-diamonds");
  daysLater(14);
  await post("/api/game/comeback/gift/claim");
  await post("/api/game/claim-daily-diamonds");
  daysLater(14);
  assert.equal(await gift(), undefined); // away 14 days again, gift 14 days ago
  daysLater(15);
  assert.equal(await gift(), undefined); // 29 days since the gift, and 29 days away
  await post("/api/game/claim-daily-diamonds");
  daysLater(14);
  assert.equal((await gift()).diamonds, 300); // 43 days since the gift
});

test("the gift is logged as its own Diamond source", async () => {
  await post("/api/game/claim-daily-diamonds");
  daysLater(14);
  await post("/api/game/comeback/gift/claim");
  const admin = await t.adminCookie();
  const flow = (await t.request("GET", "/api/admin/diamond-flow", { cookie: admin })).body;
  assert.equal(flow.totals.sources.comebackGifts, 300);
});

test("the summary lists new Collections with progress and new Events, and shows once", async () => {
  await post("/api/game/claim-daily-diamonds");
  daysLater(14);
  const { summary } = (await get("/api/game/comeback")).body;
  assert.equal(summary.awayDays, 14);
  assert.deepEqual(summary.collections, [{ id: "newer", label: "Newer", owned: 0, total: 1 }]);
  assert.deepEqual(summary.events.map((e) => e.id), ["spring"]);
  await post("/api/game/comeback/summary-seen");
  assert.equal((await get("/api/game/comeback")).body.summary, null);
  // Claiming the Daily (the return) does not bring it back.
  await post("/api/game/claim-daily-diamonds");
  assert.equal((await get("/api/game/comeback")).body.summary, null);
});

test("no summary for a player who is not away", async () => {
  await post("/api/game/claim-daily-diamonds");
  assert.equal((await get("/api/game/comeback")).body.summary, null);
});
