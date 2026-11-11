// One-off relaunch migration (#47). See docs/relaunch-migration.md.
//
//   node scripts/relaunch-migration.mjs --db /path/to/tcg.db [--reopens-at ISO] [--note "text"]
//
// --db defaults to $DB_PATH, then data/tcg.db. Switches maintenance on and LEAVES it on.
// Safe to run twice: the second run only reprints the report. To rehearse, point
// --db at a COPY of the production database.
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "../server/app.mjs";
import { openDatabase } from "../server/db.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };

const dbPath = opt("--db") ?? process.env.DB_PATH ?? path.join(root, "data", "tcg.db");
const db = openDatabase(dbPath);
const { runRelaunchMigration } = await createApp({
  db,
  clock: { now: () => Date.now() },
  random: Math.random,
  mailer: {}, // no admin e-mails from a one-off run
  config: { jwtSecret: "migration", adminPassword: "", adminEmail: "", corsOrigin: "", appUrl: "", isProduction: false, distPath: path.join(root, "dist") },
});

const report = runRelaunchMigration({ reopensAt: opt("--reopens-at") ?? null, note: opt("--note") ?? null });

console.log(`\nDatabase: ${dbPath}`);
console.log(report.alreadyRun ? "Already run earlier: nothing changed. Report from that run:" : "Migration done. Maintenance is ON; reopen by hand in the admin panel.");
console.log(`Players with a payout or cancelled Trades: ${report.playersAffected}`);
console.log(`Achievement payouts: ${report.achievementPayoutTotal} Diamonds`);
console.log(`Cancelled Trades: ${report.cancelledTrades}`);
for (const t of report.topUps) console.log(`Top-up ${t.collectionId}: ${t.rare} Rare + ${t.epic} Epic (${t.rare + t.epic} Copies)`);
if (report.topUps.length === 0) console.log("Top-ups: none");
db.close();
process.exit(0);
