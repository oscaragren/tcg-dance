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

const claim = () => t.request("POST", "/api/game/claim-daily-diamonds", { cookie: player.cookie });
const state = async () => (await t.request("GET", "/api/game/state", { cookie: player.cookie })).body;

test("a new player starts with 500 diamonds and can claim", async () => {
  const s = await state();
  assert.equal(s.diamonds, 500);
  assert.equal(s.canClaimDailyDiamonds, true);
});

test("claiming awards the daily diamonds once per day", async () => {
  const first = await claim();
  assert.equal(first.status, 200);
  assert.equal(first.body.diamondsAwarded, 150);
  assert.equal(first.body.state.diamonds, 650);
  assert.equal(first.body.state.canClaimDailyDiamonds, false);

  const second = await claim();
  assert.equal(second.status, 400);
  assert.equal((await state()).diamonds, 650);
});

test("the day does not roll over at 23:59 Stockholm time", async () => {
  clock.set("2026-03-10T23:59:00+01:00");
  assert.equal((await claim()).status, 200);
  clock.set("2026-03-10T23:59:59+01:00");
  assert.equal((await claim()).status, 400);
});

test("the day rolls over at 00:00 Europe/Stockholm, not UTC", async () => {
  clock.set("2026-03-10T23:59:00+01:00");
  assert.equal((await claim()).status, 200);

  // 23:30 UTC is already 00:30 the next day in Stockholm (CET, UTC+1).
  clock.set("2026-03-10T23:30:00Z");
  const next = await claim();
  assert.equal(next.status, 200);
  assert.equal(next.body.diamondStreak, 2);
});

test("the day boundary follows summer time (CEST, UTC+2)", async () => {
  clock.set("2026-07-01T21:30:00Z"); // 23:30 in Stockholm
  assert.equal((await claim()).status, 200);
  clock.set("2026-07-01T22:00:00Z"); // 00:00 in Stockholm, next day
  assert.equal((await claim()).status, 200);
});

const DAY = 24 * 60 * 60 * 1000;

test("each claim advances the Streak one step; the 7th pays 500 and the track restarts", async () => {
  for (let i = 1; i <= 6; i++) {
    const res = await claim();
    assert.equal(res.body.diamondStreak, i);
    assert.equal(res.body.streakBonusAwarded, 0);
    clock.advance(DAY);
  }
  const seventh = await claim();
  assert.equal(seventh.body.streakBonusAwarded, 500);
  assert.equal(seventh.body.diamondsAwarded, 650);
  assert.equal(seventh.body.diamondStreak, 0);

  clock.advance(DAY);
  assert.equal((await claim()).body.diamondStreak, 1);
});

test("a missed day pauses the Streak instead of resetting it", async () => {
  for (let i = 1; i <= 3; i++) {
    assert.equal((await claim()).body.diamondStreak, i);
    clock.advance(DAY);
  }
  clock.advance(5 * DAY); // miss five days
  assert.equal((await state()).diamondStreak, 3);
  assert.equal((await claim()).body.diamondStreak, 4);
});

test("a gap across Stockholm midnight still only moves the Streak one step", async () => {
  clock.set("2026-03-10T23:59:00+01:00");
  assert.equal((await claim()).body.diamondStreak, 1);
  clock.set("2026-03-12T00:01:00+01:00"); // skipped the 11th entirely
  assert.equal((await claim()).body.diamondStreak, 2);
});

test("the Streak bonus is logged as its own Diamond source", async () => {
  for (let i = 1; i <= 7; i++) {
    await claim();
    clock.advance(DAY);
  }
  const rows = t.db
    .prepare("SELECT type, diamonds FROM game_events WHERE user_id = ? ORDER BY id")
    .all(player.userId)
    .filter((r) => r.type === "daily" || r.type === "streak_bonus");
  assert.equal(rows.filter((r) => r.type === "daily").length, 7);
  assert.ok(rows.filter((r) => r.type === "daily").every((r) => r.diamonds === 150));
  assert.deepEqual(rows.filter((r) => r.type === "streak_bonus"), [{ type: "streak_bonus", diamonds: 500 }]);
});
