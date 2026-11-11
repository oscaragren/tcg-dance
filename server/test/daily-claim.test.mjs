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

test("a missed day resets the streak; 7 consecutive days pay the bonus", async () => {
  const day = 24 * 60 * 60 * 1000;
  for (let i = 1; i <= 6; i++) {
    const res = await claim();
    assert.equal(res.body.diamondStreak, i);
    clock.advance(day);
  }
  const seventh = await claim();
  assert.equal(seventh.body.streakBonusAwarded, 500);
  assert.equal(seventh.body.diamondsAwarded, 650);
  assert.equal(seventh.body.diamondStreak, 0);

  clock.advance(day);
  assert.equal((await claim()).body.diamondStreak, 1);
  clock.advance(2 * day); // skip a day
  assert.equal((await claim()).body.diamondStreak, 1);
});
