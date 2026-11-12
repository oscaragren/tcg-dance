import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeClock, seededRandom, startTestApp } from "./harness.mjs";

const HOUR = 3600 * 1000;
let t, clock, player, other;
async function setup(random = seededRandom([0])) {
  clock = fakeClock("2026-03-10T12:00:00+01:00"); // a Tuesday
  t = await startTestApp({ clock, random });
  player = await t.registerPlayer();
  other = await t.registerPlayer();
}
beforeEach(() => setup());
afterEach(() => t.close());

const goals = async (who = player) => (await t.request("GET", "/api/game/weekly-goals", { cookie: who.cookie })).body.goals;
const goal = async (id, who = player) => (await goals(who)).find((g) => g.id === id);
const diamonds = async (who = player) => (await t.request("GET", "/api/game/state", { cookie: who.cookie })).body.diamonds;
const claim = (id, who = player) => t.request("POST", `/api/game/weekly-goals/${id}/claim`, { cookie: who.cookie });
const buy = (quantity = 1, who = player) =>
  t.request("POST", "/api/game/buy-pack", { cookie: who.cookie, body: { collectionId: "test", quantity } });
const give = (userId, ...cardIds) => {
  for (const id of cardIds) {
    t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(userId, id);
    t.db.prepare("INSERT OR IGNORE INTO ever_owned_cards (user_id, card_id) VALUES (?, ?)").run(userId, id);
  }
};
const trade = async (from, to, offeredCardIds, requestedCardIds) => {
  const sent = await t.request("POST", "/api/trade", {
    cookie: from.cookie, body: { receiverUserId: to.userId, offeredCardIds, requestedCardIds },
  });
  assert.ok(sent.status < 300, JSON.stringify(sent.body));
  const res = await t.request("POST", `/api/trade/${sent.body.tradeId}/accept`, { cookie: to.cookie });
  assert.equal(res.status, 200, JSON.stringify(res.body));
};

test("requires login", async () => {
  assert.equal((await t.request("GET", "/api/game/weekly-goals")).status, 401);
});

test("three goals worth 100 Diamonds each, all at zero progress", async () => {
  const list = await goals();
  assert.deepEqual(list.map((g) => [g.id, g.target, g.reward, g.progress, g.claimed]), [
    ["packs", 5, 100, 0, false], ["new-cards", 3, 100, 0, false], ["trade", 1, 100, 0, false],
  ]);
});

test("opening Packs counts toward 'Öppna 5 Packs'", async () => {
  await buy(1);
  assert.equal((await goal("packs")).progress, 1);
  t.db.prepare("UPDATE player_state SET diamonds = 1000 WHERE user_id = ?").run(player.userId);
  await buy(5);
  const g = await goal("packs");
  assert.equal(g.progress, 5); // capped at the target
  assert.equal(g.complete, true);
});

test("a Card the player has owned before is not new", async () => {
  give(player.userId, "c1");
  await buy(); // random 0 → [c1, c1]
  assert.equal((await goal("new-cards")).progress, 0);
});

test("two Copies of a new Card in one Pack count once", async () => {
  await buy(); // [c1, c1]
  assert.equal((await goal("new-cards")).progress, 1);
});

test("Chests count their new Cards, and are not Packs", async () => {
  const now = clock.now();
  t.db.prepare("INSERT INTO chests (id, user_id, type, bought_at, ready_at) VALUES ('ch', ?, 'bronze', ?, ?)")
    .run(player.userId, new Date(now - 2 * HOUR).toISOString(), new Date(now - HOUR).toISOString());
  const res = await t.request("POST", "/api/game/chests/ch/collect", { cookie: player.cookie });
  assert.equal(res.status, 200);
  assert.equal(res.body.cards.length, 2); // a common and a rare, both new
  assert.equal((await goal("new-cards")).progress, 2);
  assert.equal((await goal("packs")).progress, 0);
});

test("an Upgrade counts its resulting Card when new", async () => {
  give(player.userId, ...Array(101).fill("c1")); // 100 Duplicates
  const res = await t.request("POST", "/api/game/upgrade", { cookie: player.cookie, body: { cardIds: Array(100).fill("c1") } });
  assert.equal(res.status, 200);
  assert.equal((await goal("new-cards")).progress, 1);
});

test("a Trade counts when the player receives a new Card", async () => {
  give(player.userId, "c1"); give(other.userId, "c2");
  await trade(player, other, ["c1"], ["c2"]);
  assert.equal((await goal("trade", player)).progress, 1);
  assert.equal((await goal("trade", other)).progress, 1);
  assert.equal((await goal("new-cards", player)).progress, 1);
});

test("a Trade where the player only receives Diamonds does not count for them", async () => {
  give(player.userId, "c1");
  const sent = await t.request("POST", "/api/trade", {
    cookie: other.cookie, body: { receiverUserId: player.userId, offeredDiamonds: 10, requestedCardIds: ["c1"] },
  });
  await t.request("POST", `/api/trade/${sent.body.tradeId}/accept`, { cookie: player.cookie });
  assert.equal((await goal("trade", player)).progress, 0); // got Diamonds only
  assert.equal((await goal("trade", other)).progress, 1); // got a new Card
});

test("swapping a Copy back and forth earns nothing for the player who gets their Card back", async () => {
  give(player.userId, "c1"); give(other.userId, "c2");
  await trade(player, other, ["c1"], ["c2"]); // each receives a new Card
  await trade(player, other, ["c2"], ["c1"]); // each gets their original Card back
  assert.equal((await goal("trade", player)).progress, 1);
  assert.equal((await goal("trade", other)).progress, 1);
  assert.equal((await goal("new-cards", player)).progress, 1);
  assert.equal((await goal("new-cards", other)).progress, 1);
});

test("claiming a finished goal pays 100 Diamonds once", async () => {
  await buy(5);
  const before = await diamonds();
  const res = await claim("packs");
  assert.equal(res.status, 200);
  assert.equal(res.body.diamondsAwarded, 100);
  assert.equal(await diamonds(), before + 100);
  assert.equal((await goal("packs")).claimed, true);
  assert.equal((await claim("packs")).status, 400);
  assert.equal(await diamonds(), before + 100);
});

test("an unfinished or unknown goal cannot be claimed", async () => {
  await buy(1);
  assert.equal((await claim("packs")).status, 400);
  assert.equal((await claim("nope")).status, 404);
});

test("finished goals wait in 'Väntar på dig' until claimed", async () => {
  await buy(5);
  const items = async () => (await t.request("GET", "/api/game/waiting", { cookie: player.cookie })).body.items;
  const item = (await items()).find((i) => i.type === "weekly_goal");
  assert.equal(item.id, "packs");
  assert.equal(item.goal.reward, 100);
  await claim("packs");
  assert.equal((await items()).some((i) => i.type === "weekly_goal"), false);
});

test("Monday 00:00 Stockholm pays finished unclaimed goals and resets progress", async () => {
  await buy(5);
  const before = await diamonds();
  clock.set("2026-03-15T23:59:00+01:00"); // Sunday night
  assert.equal(await diamonds(), before);
  assert.equal((await goal("packs")).progress, 5);
  clock.set("2026-03-16T00:00:00+01:00"); // Monday
  assert.equal(await diamonds(), before + 100);
  const g = await goal("packs");
  assert.equal(g.progress, 0);
  assert.equal(g.claimed, false);
});

test("a goal claimed before the reset is not paid again", async () => {
  await buy(5);
  await claim("packs");
  const before = await diamonds();
  clock.set("2026-03-16T00:00:00+01:00");
  assert.equal(await diamonds(), before);
});

test("unfinished goals just reset on Monday", async () => {
  await buy(1);
  const before = await diamonds();
  clock.set("2026-03-16T00:00:00+01:00");
  assert.equal(await diamonds(), before);
  assert.equal((await goal("packs")).progress, 0);
});

test("the reset follows Stockholm time across the DST change", async () => {
  clock.set("2026-03-29T12:00:00+02:00"); // Sunday after the clocks went forward
  await buy(5);
  const before = await diamonds();
  clock.set("2026-03-29T23:59:00+02:00");
  assert.equal(await diamonds(), before);
  clock.set("2026-03-29T22:00:00Z"); // 00:00 Monday in Stockholm
  assert.equal(await diamonds(), before + 100);
});

test("weekly goal payouts are logged as their own Diamond source", async () => {
  await buy(5);
  await claim("packs");
  const row = t.db.prepare("SELECT diamonds FROM game_events WHERE user_id = ? AND type = 'weekly_goal'").get(player.userId);
  assert.equal(row.diamonds, 100);

  // an automatic payout is logged the same way
  await t.close(); await setup();
  await buy(5);
  clock.set("2026-03-16T00:00:00+01:00");
  await diamonds();
  assert.equal(t.db.prepare("SELECT COUNT(*) AS n FROM game_events WHERE type = 'weekly_goal'").get().n, 1);
});
