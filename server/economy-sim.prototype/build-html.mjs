// PROTOTYPE — inline sim.mjs + seed.json into one double-clickable HTML file.
import { readFileSync, writeFileSync } from "node:fs";
const here = (p) => new URL(p, import.meta.url);
const sim = readFileSync(here("./sim.mjs"), "utf8").replace(/^export /gm, "");
const seed = readFileSync(here("./seed.json"), "utf8");
const html = readFileSync(here("./page.template.html"), "utf8")
  .replace("__SIM__", () => sim)
  .replace("__SEED__", () => seed);
writeFileSync(here("./card-pool-simulator.prototype.html"), html);
console.log("wrote card-pool-simulator.prototype.html");
