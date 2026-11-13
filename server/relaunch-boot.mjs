// Opt-in automatic relaunch at boot. Does nothing unless RELAUNCH_AUTO_AT (an ISO
// time with offset, e.g. 2026-11-14T00:00:00+01:00) is set. Then it runs the relaunch
// migration once, before the server listens: maintenance goes on with autoReopen, so the
// game reopens by itself at that time. The migration is idempotent (a settings marker),
// so later boots only report. If it throws, the game stays closed until an admin opens it.
import { setMaintenance } from "./maintenance.mjs";

export function runRelaunchOnBoot({ db, env, runMigration, log = console.log, error = console.error }) {
  const at = env.RELAUNCH_AUTO_AT;
  if (!at) return "off";
  if (Number.isNaN(Date.parse(at))) {
    error(`[relaunch] RELAUNCH_AUTO_AT=${JSON.stringify(at)} is not a valid time; migration NOT run.`);
    return "invalid";
  }
  try {
    const report = runMigration({ reopensAt: at, note: "Vi uppdaterar", autoReopen: true });
    if (report.alreadyRun) { log("[relaunch] migration already run on this database; nothing changed."); return "already-run"; }
    log(`[relaunch] migration done. players=${report.playersAffected} achievementPayout=${report.achievementPayoutTotal} cancelledTrades=${report.cancelledTrades} topUps=${JSON.stringify(report.topUps)}. Game closed until ${at}.`);
    return "migrated";
  } catch (err) {
    error("[relaunch] migration FAILED; game closed until an admin opens it:", err);
    setMaintenance(db, { on: true, note: "Vi uppdaterar" });
    return "failed";
  }
}
