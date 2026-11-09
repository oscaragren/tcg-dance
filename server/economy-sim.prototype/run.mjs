// PROTOTYPE — print a model comparison table. Usage: node run.mjs [days] [seeds]
import { readFileSync } from "node:fs";
import { MODELS, DEFAULT_PARAMS, runModel, summarize } from "./sim.mjs";

const seedData = JSON.parse(readFileSync(new URL("./seed.json", import.meta.url)));
const days = Number(process.argv[2] ?? 90);
const seeds = Number(process.argv[3] ?? 3);
const pct = (x) => (x * 100).toFixed(1) + "%";
const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

for (const model of MODELS) {
  const runs = [];
  for (let s = 1; s <= seeds; s++) runs.push(summarize(runModel(seedData, model, { ...DEFAULT_PARAMS, days, seed: s })));
  const r = runs[0];
  const colAvg = (key) => r[key].map((_, ci) => avg(runs.map((x) => x[key][ci])));
  console.log(`\n${model.id} ${model.name}`);
  console.log(`  Rare+ share of pulls: week 1 ${pct(avg(runs.map((x) => x.rarePlusWeek1)))}, last week ${pct(avg(runs.map((x) => x.rarePlusLastWeek)))}`);
  console.log(`  Upgrades: ${avg(runs.map((x) => x.upgrades)).toFixed(0)}, gave a new Card ${pct(avg(runs.map((x) => x.upgradesNewShare)))}, blocked ${avg(runs.map((x) => x.upgradesBlocked)).toFixed(0)}`);
  console.log(`  Legendary held (SM26, SM21-25): ${r.legendaryHeldStart.join("/")} -> ${colAvg("legendaryHeld").map((x) => x.toFixed(0)).join("/")}`);
  console.log(`  Avg completion: ${r.avgCompletionStart.map(pct).join("/")} -> ${colAvg("avgCompletionEnd").map(pct).join("/")}`);
  console.log(`  Players complete (of 40): ${r.completedStart.join("/")} -> ${colAvg("completedEnd").map((x) => x.toFixed(1)).join("/")}; median day ${r.completionDays.map((c) => c.medianDay ?? "-").join("/")}`);
  if (model.topUp) console.log(`  Top-ups: ${avg(runs.map((x) => x.topUps)).toFixed(1)} adding ${avg(runs.map((x) => x.topUpCopies)).toFixed(0)} Rare/Epic Copies`);
  if (model.pity) console.log(`  Pity triggers: ${avg(runs.map((x) => x.pityHits)).toFixed(0)}`);
}
