import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeClock, startTestApp } from "./harness.mjs";

// "Det här är nytt" (#48): one-time sheet for players who existed at the relaunch
// migration, with personal lines from relaunch_migration_players.
const DAY = 24 * 60 * 60 * 1000;
let t, clock;
beforeEach(async () => {
  clock = fakeClock("2026-03-10T12:00:00+01:00");
  t = await startTestApp({ clock });
});
afterEach(() => t.close());

const sheet = async (p) => (await t.request("GET", "/api/game/whats-new", { cookie: p.cookie })).body.sheet;
const seen = (p) => t.request("POST", "/api/game/whats-new/seen", { cookie: p.cookie });
const migrate = async () => { clock.advance(60_000); await t.runRelaunchMigration();
  await t.request("PUT", "/api/admin/maintenance", { cookie: await t.adminCookie(), body: { on: false } });
};
const record = (p, achievementPayout, cancelledTrades) =>
  t.db.prepare("INSERT INTO relaunch_migration_players (user_id, achievement_payout, cancelled_trades, migrated_at) VALUES (?, ?, ?, ?)")
    .run(p.userId, achievementPayout, cancelledTrades, new Date(clock.now()).toISOString());

test("no sheet before the migration has run", async () => {
  const p = await t.registerPlayer();
  assert.equal(await sheet(p), null);
});

test("an existing player sees the sheet once; a player with no recorded row gets no personal lines", async () => {
  const p = await t.registerPlayer();
  await migrate();
  assert.deepEqual(await sheet(p), { achievementPayout: 0, cancelledTrades: 0 });
  await seen(p);
  assert.equal(await sheet(p), null);
  assert.equal(await sheet(p), null);
});

test("personal lines carry the numbers the migration recorded", async () => {
  const p = await t.registerPlayer();
  await migrate();
  record(p, 450, 3);
  assert.deepEqual(await sheet(p), { achievementPayout: 450, cancelledTrades: 3 });
});

test("an account created after the migration never sees the sheet", async () => {
  await t.registerPlayer();
  await migrate();
  clock.advance(DAY);
  const late = await t.registerPlayer();
  assert.equal(await sheet(late), null);
});

test("when the sheet and the Comeback summary are both due, only the sheet shows", async () => {
  const p = await t.registerPlayer();
  await t.request("POST", "/api/game/claim-daily-diamonds", { cookie: p.cookie });
  await migrate();
  clock.advance(14 * DAY);
  await t.request("GET", "/api/game/waiting", { cookie: p.cookie }); // the return is noted
  assert.equal((await t.request("GET", "/api/game/comeback", { cookie: p.cookie })).body.summary, null);
  assert.notEqual(await sheet(p), null);
  await seen(p);
  assert.equal((await t.request("GET", "/api/game/comeback", { cookie: p.cookie })).body.summary, null); // not shown afterwards either
  const items = (await t.request("GET", "/api/game/waiting", { cookie: p.cookie })).body.items;
  assert.ok(items.some((i) => i.type === "comeback_gift")); // the gift is still waiting
});
