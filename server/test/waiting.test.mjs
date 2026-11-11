import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { TEST_CATALOG, fakeClock, startTestApp } from "./harness.mjs";

const HOUR = 3600 * 1000;
let t, clock, player, other;
beforeEach(async () => {
  clock = fakeClock("2026-03-10T12:00:00+01:00");
  t = await startTestApp({ clock });
  player = await t.registerPlayer();
  other = await t.registerPlayer();
});
afterEach(() => t.close());

const waiting = (who = player) => t.request("GET", "/api/game/waiting", { cookie: who.cookie });
const types = async (who) => (await waiting(who)).body.items.map((i) => i.type);
const give = (userId, ...cardIds) => {
  for (const id of cardIds) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(userId, id);
};
const addChest = (userId, id, readyInMs) => {
  const now = clock.now();
  t.db.prepare("INSERT INTO chests (id, user_id, type, bought_at, ready_at) VALUES (?, ?, 'bronze', ?, ?)")
    .run(id, userId, new Date(now - HOUR).toISOString(), new Date(now + readyInMs).toISOString());
};
// Offers 10 diamonds for one of the receiver's Cards (a Trade must ask for something).
const sendTrade = (from, to) => {
  give(to.userId, "c2");
  return t.request("POST", "/api/trade", {
    cookie: from.cookie,
    body: { receiverUserId: to.userId, offeredDiamonds: 10, requestedCardIds: ["c2"] },
  });
};
const claimDaily = (who = player) => t.request("POST", "/api/game/claim-daily-diamonds", { cookie: who.cookie });

test("requires login", async () => {
  assert.equal((await t.request("GET", "/api/game/waiting")).status, 401);
});

test("a fresh player only has the Daily claim waiting", async () => {
  const { status, body } = await waiting();
  assert.equal(status, 200);
  assert.deepEqual(body.items, [{ type: "daily", id: "daily", diamonds: 150 }]);
});

test("nothing is waiting once the Daily claim is taken", async () => {
  await claimDaily();
  assert.deepEqual((await waiting()).body.items, []);
});

test("items come in order: Trades, Chest, Achievements, Daily claim", async () => {
  await sendTrade(other, player);
  addChest(player.userId, "ch1", -1000);
  give(player.userId, "r1"); // first Rare → claimable Achievement
  const { body } = await waiting();
  assert.deepEqual(body.items.map((i) => i.type), ["trade", "chest", "achievement", "daily"]);
});

test("an incoming Trade carries the trade and its sender", async () => {
  const sent = await sendTrade(other, player);
  const [item] = (await waiting()).body.items;
  assert.equal(item.type, "trade");
  assert.equal(item.id, sent.body.tradeId);
  assert.equal(item.trade.sender.id, other.userId);
  assert.equal(item.trade.offeredDiamonds, 10);
});

test("outgoing and answered Trades are not waiting on the player", async () => {
  const sent = await sendTrade(player, other);
  assert.equal((await types(player)).includes("trade"), false);
  await t.request("POST", `/api/trade/${sent.body.tradeId}/reject`, { cookie: other.cookie });
  assert.equal((await types(other)).includes("trade"), false);
});

test("a Chest is waiting only when ready", async () => {
  addChest(player.userId, "ch1", 2 * HOUR);
  assert.equal((await types()).includes("chest"), false);
  clock.advance(3 * HOUR);
  const chest = (await waiting()).body.items.find((i) => i.type === "chest");
  assert.equal(chest.id, "ch1");
  assert.equal(chest.chest.ready, true);
});

test("a claimed Achievement is no longer waiting", async () => {
  give(player.userId, "r1");
  const item = (await waiting()).body.items.find((i) => i.type === "achievement");
  assert.ok(item.achievement.reward > 0);
  const res = await t.request("POST", `/api/achievements/${item.id}/claim`, { cookie: player.cookie });
  assert.equal(res.status, 200);
  assert.equal((await types()).includes("achievement"), false);
});

test("Trades are ordered newest first and only the player's own show", async () => {
  const a = await sendTrade(other, player);
  clock.advance(1000);
  const third = await t.registerPlayer();
  const b = await sendTrade(third, player);
  const ids = (await waiting()).body.items.filter((i) => i.type === "trade").map((i) => i.id);
  assert.deepEqual(ids, [b.body.tradeId, a.body.tradeId]);
  assert.deepEqual((await types(third)), ["daily"]);
});

test("during an Event the Daily claim shows the Event's amount", async () => {
  const catalog = {
    ...TEST_CATALOG,
    events: [{ id: "e", label: "Lördagsbonus", startsAt: "2026-03-10T00:00:00+01:00", endsAt: "2026-03-11T00:00:00+01:00", dailyDiamonds: 800 }],
  };
  const t2 = await startTestApp({ clock, catalog });
  try {
    const p = await t2.registerPlayer();
    const { body } = await t2.request("GET", "/api/game/waiting", { cookie: p.cookie });
    assert.equal(body.items[0].diamonds, 800);
  } finally { await t2.close(); }
});

test("game state exposes the running Event, or null", async () => {
  assert.equal((await t.request("GET", "/api/game/state", { cookie: player.cookie })).body.event, null);
  const catalog = {
    ...TEST_CATALOG,
    events: [{ id: "e", label: "Lördagsbonus", startsAt: "2026-03-10T00:00:00+01:00", endsAt: "2026-03-11T00:00:00+01:00", dailyDiamonds: 800, chestWaitHours: { gold: 3 } }],
  };
  const t2 = await startTestApp({ clock, catalog });
  try {
    const p = await t2.registerPlayer();
    const { event } = (await t2.request("GET", "/api/game/state", { cookie: p.cookie })).body;
    assert.equal(event.label, "Lördagsbonus");
    assert.equal(event.dailyDiamonds, 800);
    assert.deepEqual(event.chestWaitHours, { gold: 3 });
  } finally { await t2.close(); }
});
