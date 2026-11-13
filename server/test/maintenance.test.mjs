import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./harness.mjs";

let t;
afterEach(() => t.close());

const REOPEN = "2026-03-10T18:00:00.000Z";
const turnOn = (admin, body = {}) =>
  t.request("PUT", "/api/admin/maintenance", { cookie: admin, body: { on: true, reopensAt: REOPEN, note: "Vi flyttar spelet.", ...body } });

test("the game is open by default", async () => {
  t = await startTestApp();
  const res = await t.request("GET", "/api/maintenance");
  assert.equal(res.status, 200);
  assert.equal(res.body.on, false);
  const p = await t.registerPlayer();
  assert.equal((await t.request("GET", "/api/game/state", { cookie: p.cookie })).status, 200);
});

test("while on, player routes refuse with a maintenance response carrying reopening time and note", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  const p = await t.registerPlayer();
  assert.equal((await turnOn(admin)).status, 200);

  for (const [method, path] of [["GET", "/api/game/state"], ["POST", "/api/game/buy-pack"], ["GET", "/api/leaderboard"], ["GET", "/api/game/collections"]]) {
    const res = await t.request(method, path, { cookie: p.cookie });
    assert.equal(res.status, 503, path);
    assert.equal(res.body.maintenance, true);
    assert.equal(res.body.reopensAt, REOPEN);
    assert.equal(res.body.note, "Vi flyttar spelet.");
  }
  const login = await t.request("POST", "/api/auth/login", { body: { email: "x@example.com", password: "nope" } });
  assert.equal(login.status, 503);
  const register = await t.request("POST", "/api/auth/register", { body: {} });
  assert.equal(register.status, 503);
});

test("the public status endpoint stays reachable and reports the state", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  await turnOn(admin);
  const res = await t.request("GET", "/api/maintenance");
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { on: true, reopensAt: REOPEN, note: "Vi flyttar spelet." });
});

test("admin login and admin routes work while on, and the admin can switch it off", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  await turnOn(admin);
  const login = await t.request("POST", "/api/admin/login", { body: { password: "admin-pw" } });
  assert.equal(login.status, 200);
  assert.equal((await t.request("GET", "/api/admin/overview", { cookie: admin })).status, 200);
  assert.equal((await t.request("GET", "/api/admin/maintenance", { cookie: admin })).body.on, true);

  const off = await t.request("PUT", "/api/admin/maintenance", { cookie: admin, body: { on: false } });
  assert.equal(off.status, 200);
  assert.equal(off.body.on, false);
  const p = await t.registerPlayer();
  assert.equal((await t.request("GET", "/api/game/state", { cookie: p.cookie })).status, 200);
});

test("maintenance settings require admin and valid input", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  assert.equal((await t.request("PUT", "/api/admin/maintenance", { body: { on: true } })).status, 401);
  assert.equal((await t.request("GET", "/api/admin/maintenance")).status, 401);
  assert.equal((await turnOn(admin, { reopensAt: "not a date" })).status, 400);
  assert.equal((await t.request("PUT", "/api/admin/maintenance", { cookie: admin, body: {} })).status, 400);
  // reopening time and note are optional
  const bare = await t.request("PUT", "/api/admin/maintenance", { cookie: admin, body: { on: true } });
  assert.equal(bare.status, 200);
  assert.equal(bare.body.reopensAt, null);
});

test("the switch is stored in the database, not in memory", async () => {
  t = await startTestApp();
  const admin = await t.adminCookie();
  await turnOn(admin);
  const row = t.db.prepare("SELECT value FROM settings WHERE key = 'maintenance'").get();
  assert.ok(row);
});
