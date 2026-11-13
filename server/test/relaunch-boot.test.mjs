import { test } from "node:test";
import assert from "node:assert/strict";
import { runRelaunchOnBoot } from "../relaunch-boot.mjs";
import { openDatabase } from "../db.mjs";
import { getMaintenance } from "../maintenance.mjs";

const AT = "2026-11-14T00:00:00+01:00";
const harness = (over = {}) => {
  const logs = [];
  const calls = [];
  const db = openDatabase(":memory:");
  return {
    db, logs, calls,
    run: (env, runMigration) => runRelaunchOnBoot({
      db, env, log: (...a) => logs.push(a.join(" ")), error: (...a) => logs.push("ERR " + a.join(" ")),
      runMigration: runMigration ?? ((opts) => { calls.push(opts); return { alreadyRun: false, playersAffected: 3, achievementPayoutTotal: 100, cancelledTrades: 2, topUps: [] }; }),
      ...over,
    }),
  };
};

test("does nothing when RELAUNCH_AUTO_AT is not set", () => {
  const h = harness();
  assert.equal(h.run({}), "off");
  assert.equal(h.calls.length, 0);
  assert.equal(getMaintenance(h.db).on, false);
});

test("runs the migration with autoReopen and the given reopening time", () => {
  const h = harness();
  assert.equal(h.run({ RELAUNCH_AUTO_AT: AT }), "migrated");
  assert.deepEqual(h.calls, [{ reopensAt: AT, note: "Vi uppdaterar", autoReopen: true }]);
});

test("an unparseable time does nothing and says so", () => {
  const h = harness();
  assert.equal(h.run({ RELAUNCH_AUTO_AT: "fredag" }), "invalid");
  assert.equal(h.calls.length, 0);
  assert.ok(h.logs.some((l) => l.startsWith("ERR")));
});

test("a second boot (marker already set) reports already-run and does not change maintenance", () => {
  const h = harness();
  const result = h.run({ RELAUNCH_AUTO_AT: AT }, () => ({ alreadyRun: true, playersAffected: 3, achievementPayoutTotal: 100, cancelledTrades: 2, topUps: [] }));
  assert.equal(result, "already-run");
  assert.equal(getMaintenance(h.db).on, false);
});

test("if the migration throws, the game is closed (no auto-reopen) and boot continues", () => {
  const h = harness();
  const result = h.run({ RELAUNCH_AUTO_AT: AT }, () => { throw new Error("boom"); });
  assert.equal(result, "failed");
  const m = getMaintenance(h.db);
  assert.equal(m.on, true);
  assert.equal(m.reopensAt, null);
  assert.ok(h.logs.some((l) => l.includes("boom")));
});
