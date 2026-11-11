import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp, TEST_CATALOG, fakeClock, seededRandom } from "./harness.mjs";

let t;
afterEach(() => t.close());

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const START = "2026-03-10T12:00:00+01:00";
const at = (offsetMs) => new Date(Date.parse(START) + offsetMs).toISOString();

async function setup(opts = {}) {
  t = await startTestApp({ clock: fakeClock(START), ...opts });
  return { admin: await t.adminCookie(), player: await t.registerPlayer() };
}

const draft = (over = {}) => ({
  label: "Testbonus",
  startsAt: at(DAY),
  endsAt: at(2 * DAY),
  dailyDiamonds: 800,
  ...over,
});
const create = (admin, body) => t.request("POST", "/api/admin/events", { cookie: admin, body });
const list = async (admin) => (await t.request("GET", "/api/admin/events", { cookie: admin })).body.events;
const state = async (player) => (await t.request("GET", "/api/game/state", { cookie: player.cookie })).body;
const waiting = async (player) => (await t.request("GET", "/api/game/waiting", { cookie: player.cookie })).body.items;

// ── Storage ──
test("Events from the content file are carried over to the database once", async () => {
  const ev = { id: "old", label: "Gammal", startsAt: at(DAY), endsAt: at(2 * DAY), dailyDiamonds: 800, chestWaitHours: { gold: 3 } };
  const { admin } = await setup({ catalog: { ...TEST_CATALOG, events: [ev] } });
  let events = await list(admin);
  assert.equal(events.length, 1);
  assert.equal(events[0].id, "old");
  assert.equal(events[0].dailyDiamonds, 800);
  assert.deepEqual(events[0].chestWaitHours, { gold: 3 });
  assert.equal(events[0].status, "upcoming");
  // deleting a carried-over Event must not bring it back on the next start
  assert.equal((await t.request("DELETE", "/api/admin/events/old", { cookie: admin })).status, 200);
  assert.deepEqual(await list(admin), []);
});

test("an Event can be created and listed, and needs a reward", async () => {
  const { admin } = await setup();
  const res = await create(admin, draft());
  assert.equal(res.status, 201);
  assert.equal((await list(admin)).length, 1);
  assert.equal((await create(admin, draft({ dailyDiamonds: null }))).status, 400);
  assert.equal((await create(admin, draft({ label: "" }))).status, 400);
  assert.equal((await create(admin, draft({ endsAt: at(DAY) }))).status, 400);
});

test("Events cannot overlap", async () => {
  const { admin } = await setup();
  assert.equal((await create(admin, draft())).status, 201);
  assert.equal((await create(admin, draft({ startsAt: at(DAY + HOUR), endsAt: at(3 * DAY) }))).status, 400);
});

test("there is no Pack-discount option", async () => {
  const { admin } = await setup();
  const res = await create(admin, draft({ packDiscount: 0.5 }));
  assert.equal(res.status, 201);
  assert.equal(res.body.event.packDiscount, undefined);
  assert.equal(t.db.prepare("SELECT COUNT(*) n FROM pragma_table_info('events') WHERE name LIKE '%discount%'").get().n, 0);
});

// ── Lifecycle ──
test("before it starts an Event can be edited and deleted", async () => {
  const { admin } = await setup();
  const { id } = (await create(admin, draft())).body.event;
  const put = await t.request("PUT", `/api/admin/events/${id}`, { cookie: admin, body: draft({ label: "Ändrad", dailyDiamonds: 900 }) });
  assert.equal(put.status, 200);
  assert.equal((await list(admin))[0].label, "Ändrad");
  assert.equal((await list(admin))[0].dailyDiamonds, 900);
  assert.equal((await t.request("DELETE", `/api/admin/events/${id}`, { cookie: admin })).status, 200);
  assert.deepEqual(await list(admin), []);
});

test("an upcoming Event cannot be ended early", async () => {
  const { admin } = await setup();
  const { id } = (await create(admin, draft())).body.event;
  assert.equal((await t.request("POST", `/api/admin/events/${id}/end`, { cookie: admin })).status, 409);
});

test("a running Event cannot be edited or deleted, only ended early", async () => {
  const { admin, player } = await setup();
  const { id } = (await create(admin, draft())).body.event;
  t.clock.advance(DAY + HOUR);
  assert.equal((await list(admin))[0].status, "running");
  assert.equal((await t.request("PUT", `/api/admin/events/${id}`, { cookie: admin, body: draft() })).status, 409);
  assert.equal((await t.request("DELETE", `/api/admin/events/${id}`, { cookie: admin })).status, 409);
  assert.equal((await state(player)).event.id, id);
  assert.equal((await t.request("POST", `/api/admin/events/${id}/end`, { cookie: admin })).status, 200);
  assert.equal((await list(admin))[0].status, "finished");
  assert.equal((await state(player)).event, null);
});

test("a finished Event is read-only", async () => {
  const { admin } = await setup();
  const { id } = (await create(admin, draft())).body.event;
  t.clock.advance(3 * DAY);
  assert.equal((await list(admin))[0].status, "finished");
  assert.equal((await t.request("PUT", `/api/admin/events/${id}`, { cookie: admin, body: draft() })).status, 409);
  assert.equal((await t.request("DELETE", `/api/admin/events/${id}`, { cookie: admin })).status, 409);
  assert.equal((await t.request("POST", `/api/admin/events/${id}/end`, { cookie: admin })).status, 409);
});

// ── Rewards ──
test("the Daily claim amount changes only while the Event runs", async () => {
  const { admin, player } = await setup();
  await create(admin, draft());
  const claim = () => t.request("POST", "/api/game/claim-daily-diamonds", { cookie: player.cookie });
  assert.equal((await claim()).body.diamondsAwarded, 150); // before
  t.clock.advance(DAY + HOUR);
  assert.equal((await claim()).body.diamondsAwarded, 800); // during
  t.clock.advance(DAY);
  assert.equal((await claim()).body.diamondsAwarded, 150); // after
});

test("Chest wait shortens only while the Event runs", async () => {
  const { admin, player } = await setup({ random: seededRandom([0]) });
  await create(admin, draft({ dailyDiamonds: null, chestWaitHours: { gold: 3 } }));
  const buy = async () => {
    await t.request("POST", "/api/game/chests/buy", { cookie: player.cookie, body: { type: "gold" } });
    const chests = (await t.request("GET", "/api/game/chests", { cookie: player.cookie })).body.chests;
    const c = chests[chests.length - 1];
    const waitH = (Date.parse(c.readyAt) - t.clock.now()) / HOUR;
    await t.request("POST", `/api/game/chests/${c.id}/collect`, { cookie: player.cookie }); // may fail, clears nothing
    t.db.prepare("DELETE FROM chests WHERE id = ?").run(c.id);
    return waitH;
  };
  t.db.prepare("UPDATE player_state SET diamonds = 100000 WHERE user_id = ?").run(player.userId);
  const before = await buy();
  t.clock.advance(DAY + HOUR);
  assert.equal(await buy(), 3);
  t.clock.advance(DAY);
  assert.equal(await buy(), before);
  assert.ok(before > 3);
});

async function collectGold(player, wait) {
  t.db.prepare("UPDATE player_state SET diamonds = 100000 WHERE user_id = ?").run(player.userId);
  await t.request("POST", "/api/game/chests/buy", { cookie: player.cookie, body: { type: "gold" } });
  const chests = (await t.request("GET", "/api/game/chests", { cookie: player.cookie })).body.chests;
  t.db.prepare("UPDATE chests SET ready_at = ? WHERE id = ?").run(new Date(t.clock.now() - 1).toISOString(), chests[0].id);
  return (await t.request("POST", `/api/game/chests/${chests[0].id}/collect`, { cookie: player.cookie })).body.diamondsAwarded;
}

test("the Chest payout multiplier applies only while the Event runs", async () => {
  const { admin, player } = await setup();
  await create(admin, draft({ dailyDiamonds: null, chestMultiplier: 2 }));
  const base = await collectGold(player);
  t.clock.advance(DAY + HOUR);
  assert.equal(await collectGold(player), base * 2);
  t.clock.advance(DAY);
  assert.equal(await collectGold(player), base);
});

test("a diamonds login gift shows in Väntar på dig during the Event and is claimable once", async () => {
  const { admin, player } = await setup();
  const { id } = (await create(admin, draft({ dailyDiamonds: null, gift: { type: "diamonds", amount: 300 } }))).body.event;
  const gifts = async () => (await waiting(player)).filter((i) => i.type === "event_gift");
  assert.equal((await gifts()).length, 0); // not started
  t.clock.advance(DAY + HOUR);
  const [item] = await gifts();
  assert.equal(item.id, id);
  assert.deepEqual([item.label, item.gift.type, item.gift.amount], ["Testbonus", "diamonds", 300]);
  const before = (await state(player)).diamonds;
  const res = await t.request("POST", `/api/game/events/${id}/gift`, { cookie: player.cookie });
  assert.equal(res.status, 200);
  assert.equal((await state(player)).diamonds, before + 300);
  assert.equal((await gifts()).length, 0);
  assert.equal((await t.request("POST", `/api/game/events/${id}/gift`, { cookie: player.cookie })).status, 400);
  // each player once
  const other = await t.registerPlayer();
  assert.equal((await t.request("POST", `/api/game/events/${id}/gift`, { cookie: other.cookie })).status, 200);
});

test("a gift cannot be claimed outside the Event, and is logged as its own Diamond source", async () => {
  const { admin, player } = await setup();
  const { id } = (await create(admin, draft({ dailyDiamonds: null, gift: { type: "diamonds", amount: 300 } }))).body.event;
  assert.equal((await t.request("POST", `/api/game/events/${id}/gift`, { cookie: player.cookie })).status, 400);
  t.clock.advance(DAY + HOUR);
  await t.request("POST", `/api/game/events/${id}/gift`, { cookie: player.cookie });
  const rows = t.db.prepare("SELECT type, diamonds FROM game_events WHERE user_id = ? AND type = 'event_gift'").all(player.userId);
  assert.deepEqual(rows, [{ type: "event_gift", diamonds: 300 }]);
  t.clock.advance(2 * DAY);
  const other = await t.registerPlayer();
  assert.equal((await t.request("POST", `/api/game/events/${id}/gift`, { cookie: other.cookie })).status, 400);
});

test("a Chest login gift gives a ready Chest of the chosen type", async () => {
  const { admin, player } = await setup();
  const { id } = (await create(admin, draft({ dailyDiamonds: null, gift: { type: "chest", chestType: "silver" } }))).body.event;
  t.clock.advance(DAY + HOUR);
  const res = await t.request("POST", `/api/game/events/${id}/gift`, { cookie: player.cookie });
  assert.equal(res.status, 200);
  const chests = (await t.request("GET", "/api/game/chests", { cookie: player.cookie })).body.chests;
  assert.equal(chests.length, 1);
  assert.equal(chests[0].type, "silver");
  assert.equal(chests[0].ready, true);
});

// ── Top-up on start ──
const TOPUP_CATALOG = {
  ...TEST_CATALOG,
  cards: [
    { id: "c1", collectionId: "test", rarity: "common", name: "C1" },
    { id: "r1", collectionId: "test", rarity: "rare", name: "R1" },
    { id: "e1", collectionId: "test", rarity: "epic", name: "E1" },
  ],
  copiesPerRarity: { common: 100, rare: 10, epic: 5, legendary: 1, special: 1 },
};

test("an Event's Top-up fires once when the Event starts, logged with source Event", async () => {
  const { admin, player } = await setup({ catalog: TOPUP_CATALOG });
  await create(admin, draft({ topUpCollectionId: "test" }));
  const log = async () => (await t.request("GET", "/api/admin/topups", { cookie: admin })).body.log;
  await state(player);
  assert.deepEqual(await log(), []); // not yet
  t.db.prepare("UPDATE card_pool SET copies_remaining = 1 WHERE card_id IN ('r1', 'e1')").run(); // Rare+ share well under 7%
  const total = () => t.db.prepare("SELECT SUM(total_copies) n FROM card_pool").get().n;
  const before = total();
  t.clock.advance(DAY + HOUR);
  await state(player); // any request after the start
  const entries = await log();
  assert.equal(entries.length, 1);
  assert.equal(entries[0].source, "event");
  assert.ok(entries[0].rare + entries[0].epic > 0);
  assert.equal(total(), before + entries[0].rare + entries[0].epic);
  await state(player);
  assert.equal((await log()).length, 1); // only once, no confirmation needed
  const ev = (await list(admin))[0];
  assert.ok(ev.topUpFiredAt);
});

test("an Event Top-up that was never fired before the Event ended is not fired late", async () => {
  const { admin, player } = await setup({ catalog: TOPUP_CATALOG });
  await create(admin, draft({ topUpCollectionId: "test" }));
  t.clock.advance(3 * DAY);
  await state(player);
  assert.deepEqual((await t.request("GET", "/api/admin/topups", { cookie: admin })).body.log, []);
});

// ── Admin overview & player view ──
test("the admin overview warns when an Event is starting soon", async () => {
  const { admin } = await setup();
  const banners = async () => (await t.request("GET", "/api/admin/overview", { cookie: admin })).body.banners;
  await create(admin, draft({ startsAt: at(10 * DAY), endsAt: at(11 * DAY) }));
  assert.equal((await banners()).some((b) => b.kind === "event_soon"), false);
  t.clock.set(at(9 * DAY));
  const soon = (await banners()).find((b) => b.kind === "event_soon");
  assert.equal(soon.label, "Testbonus");
  assert.ok(soon.startsAt);
  t.clock.set(at(10 * DAY + HOUR)); // running now, no longer "soon"
  assert.equal((await banners()).some((b) => b.kind === "event_soon"), false);
});

test("players see the running Event's rewards in state", async () => {
  const { admin, player } = await setup();
  await create(admin, draft({ chestMultiplier: 1.5, gift: { type: "diamonds", amount: 100 } }));
  t.clock.advance(DAY + HOUR);
  const ev = (await state(player)).event;
  assert.equal(ev.dailyDiamonds, 800);
  assert.equal(ev.chestMultiplier, 1.5);
  assert.deepEqual(ev.gift, { type: "diamonds", amount: 100 });
});
