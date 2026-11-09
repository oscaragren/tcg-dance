// PROTOTYPE — throwaway economy simulator for "Which Card pool and Upgrade
// model should the relaunch use?". Pure module: no DOM, no I/O. The HTML page
// and run.mjs both call into it.

export const RARITIES = ["common", "rare", "epic", "legendary", "special"];
const UPGRADE_REQUIRED = { common: 20, rare: 15, epic: 10 };
const UPGRADE_TARGET = { common: "rare", rare: "epic", epic: "legendary" };

// ── Candidate models ─────────────────────────────────────────────────────────
// draw: "pool"  = weighted by remaining Copies (today's code)
//       "fixed" = fixed Rarity odds per Card slot
// finite: Rarities whose Copies are limited (a fixed-odds slot that lands on an
//         exhausted finite Rarity falls back one Rarity down).
export const MODELS = [
  {
    id: "A", name: "Som idag",
    summary: "Finite shared Card pool, draws weighted by remaining Copies, Upgrades return the consumed Copies to the pool.",
    draw: "pool", finite: RARITIES, upgradeReturns: true,
  },
  {
    id: "B", name: "Upgrades burn Copies",
    summary: "Same finite pool, but Copies consumed by an Upgrade leave the game instead of returning to the pool.",
    draw: "pool", finite: RARITIES, upgradeReturns: false,
  },
  {
    id: "C", name: "Weekly refill",
    summary: "Today's model, but every 7 days each Collection's pool is topped back up to its original print run.",
    draw: "pool", finite: RARITIES, upgradeReturns: true, refillDays: 7,
  },
  {
    id: "D", name: "Fixed odds, unlimited",
    summary: "Fixed published Rarity odds, unlimited Copies of Common–Legendary. Only Special stays one-of-a-kind.",
    draw: "fixed", finite: ["special"],
  },
  {
    id: "E", name: "Fixed odds, finite Legendary",
    summary: "Fixed odds, unlimited Common–Epic. Legendary stays finite (a fresh print run per Card at relaunch), Special one-of-a-kind.",
    draw: "fixed", finite: ["legendary", "special"], legendaryReprint: true,
  },
  {
    id: "F", name: "Fixed odds + duplicate protection + pity",
    summary: "Model D, plus: within a Rarity you always get a Card you don't own yet (until you own them all), Upgrades too; and a guaranteed Epic or better if you go too many Packs without one.",
    draw: "fixed", finite: ["special"], dupeProtection: true, pity: true,
  },
  {
    id: "G", name: "As is + top-ups + 500 Commons",
    summary: "Today's finite pool and draw, Upgrades still return Copies, but Common→Rare costs 500 Commons, and whenever a Collection's remaining pool drops below the top-up threshold of Rare-or-better Copies, a small batch of Rare and Epic Copies is added.",
    draw: "pool", finite: RARITIES, upgradeReturns: true, topUp: true, upgradeCost: { common: 500 },
  },
  {
    id: "H", name: "G, but Upgrades burn Copies",
    summary: "Like G, but Copies consumed by an Upgrade leave the game instead of going back into the pool.",
    draw: "pool", finite: RARITIES, upgradeReturns: false, topUp: true, upgradeCost: { common: 500 },
  },
];

export const DEFAULT_PARAMS = {
  days: 90,
  packsPerDay: 195,          // all active players together (prod: 6,818 Packs / 35 days)
  cardsPerPack: 5,
  odds: { common: 0.85, rare: 0.12, epic: 0.025, legendary: 0.005 }, // per Card slot, fixed-odds models
  specialOdds: 0.0002,       // per slot, while a Special Copy is left
  legendaryReprint: 5,       // model E: Legendary Copies per Card added at relaunch
  pityPacks: 10,             // model F: an Epic+ at least every N Packs per Collection
  topUpThreshold: 0.01,      // models G/H: top up when Rare+ share of a pool's remaining Copies is below this
  topUpRare: 5,              // models G/H: Copies added per Rare Card at each top-up
  topUpEpic: 2,              // models G/H: Copies added per Epic Card at each top-up
  seed: 1,
};

// ── RNG ──────────────────────────────────────────────────────────────────────
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── World ────────────────────────────────────────────────────────────────────
export function createWorld(seedData, model, params = DEFAULT_PARAMS) {
  const cards = [];
  const cols = seedData.collections.map((c, ci) => {
    const byRarity = Object.fromEntries(RARITIES.map((r) => [r, []]));
    for (const card of c.cards) {
      const idx = cards.length;
      cards.push({ id: card.id, col: ci, rarity: card.rarity });
      byRarity[card.rarity].push(idx);
    }
    return { id: c.id, label: c.label, byRarity, size: c.cards.filter((x) => x.rarity !== "special").length };
  });
  const index = new Map(cards.map((c, i) => [c.id, i]));
  const total = new Int32Array(cards.length);
  const remaining = new Int32Array(cards.length);
  for (const c of seedData.collections) for (const card of c.cards) {
    const i = index.get(card.id);
    total[i] = card.total;
    remaining[i] = card.remaining;
  }
  if (model.legendaryReprint) {
    for (const col of cols) for (const i of col.byRarity.legendary) remaining[i] += params.legendaryReprint;
  }
  const players = seedData.players.map((p) => {
    const owned = new Int32Array(cards.length);
    for (const [id, n] of Object.entries(p.owned)) if (index.has(id)) owned[index.get(id)] = n;
    const weight = owned.reduce((a, b) => a + b, 0) + 50;
    return { name: p.name, owned, weight, dryPacks: cols.map(() => 0), completedDay: cols.map(() => null) };
  });
  const wsum = players.reduce((a, p) => a + p.weight, 0);
  for (const p of players) p.share = p.weight / wsum;

  const world = {
    model, params, cards, cols, total, remaining, players,
    inactiveOwned: seedData.inactiveOwned ?? {},
    day: 0, rand: rng(params.seed), history: [],
  };
  for (const p of players) cols.forEach((_, ci) => { if (isComplete(world, p, ci)) p.completedDay[ci] = 0; });
  world.history.push(snapshot(world, emptyDay()));
  return world;
}

const isFinite_ = (world, rarity) => world.model.finite.includes(rarity);

function emptyDay() {
  return {
    packs: 0,
    pulls: { common: 0, rare: 0, epic: 0, legendary: 0, special: 0 },
    upgrades: { common: 0, rare: 0, epic: 0 },
    upgradesNewCard: 0,
    upgradesBlocked: 0,
    pityHits: 0,
    topUps: 0,
    topUpCopies: 0,
    soldOutPacks: 0,
  };
}

function poolSum(world, ci, rarity) {
  let s = 0;
  for (const i of world.cols[ci].byRarity[rarity]) s += world.remaining[i];
  return s;
}

function pickWeighted(world, list) {
  let s = 0;
  for (const i of list) s += world.remaining[i];
  if (s <= 0) return null;
  let x = Math.floor(world.rand() * s);
  for (const i of list) { x -= world.remaining[i]; if (x < 0) return i; }
  return null;
}

// Pick a Card of a Rarity for this player, respecting finiteness and dupe protection.
function pickCardOfRarity(world, player, ci, rarity, { weightedByRemaining }) {
  let list = world.cols[ci].byRarity[rarity];
  if (isFinite_(world, rarity)) list = list.filter((i) => world.remaining[i] > 0);
  if (list.length === 0) return null;
  if (world.model.dupeProtection) {
    const missing = list.filter((i) => player.owned[i] === 0);
    if (missing.length) list = missing;
  }
  if (weightedByRemaining && isFinite_(world, rarity)) return pickWeighted(world, list);
  return list[Math.floor(world.rand() * list.length)];
}

function take(world, player, i) {
  if (isFinite_(world, world.cards[i].rarity)) world.remaining[i]--;
  player.owned[i]++;
}

function drawSlot(world, player, ci) {
  const { model, params } = world;
  if (model.draw === "pool") {
    // Every remaining Copy equally likely (server/index.mjs drawCardTx).
    const all = [];
    for (const r of RARITIES) all.push(...world.cols[ci].byRarity[r]);
    return pickWeighted(world, all);
  }
  // Fixed odds
  let x = world.rand();
  let rarity = "common";
  if (poolSum(world, ci, "special") > 0 && x < params.specialOdds) rarity = "special";
  else {
    x = world.rand();
    let acc = 0;
    for (const r of ["legendary", "epic", "rare", "common"]) {
      acc += params.odds[r];
      if (x < acc) { rarity = r; break; }
    }
  }
  const order = ["special", "legendary", "epic", "rare", "common"];
  for (let k = order.indexOf(rarity); k < order.length; k++) {
    const r = order[k];
    if (r === "special" && rarity !== "special") continue;
    const i = pickCardOfRarity(world, player, ci, r, { weightedByRemaining: true });
    if (i !== null) return i;
  }
  return null;
}

function openPack(world, player, ci, day) {
  const pulled = [];
  for (let s = 0; s < world.params.cardsPerPack; s++) {
    const i = drawSlot(world, player, ci);
    if (i !== null) { take(world, player, i); pulled.push(i); } // leaves the pool before the next slot
  }
  if (world.model.pity) {
    const hasEpicPlus = pulled.some((i) => ["epic", "legendary", "special"].includes(world.cards[i].rarity));
    if (!hasEpicPlus && player.dryPacks[ci] >= world.params.pityPacks - 1 && pulled.length) {
      const e = pickCardOfRarity(world, player, ci, "epic", { weightedByRemaining: true });
      if (e !== null) {
        const last = pulled[pulled.length - 1]; // swap the last slot for the guaranteed Epic
        player.owned[last]--;
        if (isFinite_(world, world.cards[last].rarity)) world.remaining[last]++;
        take(world, player, e);
        pulled[pulled.length - 1] = e;
        day.pityHits++;
      }
    }
    const hit = pulled.some((i) => ["epic", "legendary", "special"].includes(world.cards[i].rarity));
    player.dryPacks[ci] = hit ? 0 : player.dryPacks[ci] + 1;
  }
  for (const i of pulled) day.pulls[world.cards[i].rarity]++;
  day.packs++;
}

// A sensible player Upgrades only spare Copies (beyond the first of each Card).
function doUpgrades(world, player, ci, day) {
  for (const from of ["common", "rare", "epic"]) {
    const need = world.model.upgradeCost?.[from] ?? UPGRADE_REQUIRED[from];
    const to = UPGRADE_TARGET[from];
    for (;;) {
      const list = world.cols[ci].byRarity[from];
      let spare = 0;
      for (const i of list) spare += Math.max(0, player.owned[i] - 1);
      if (spare < need) break;
      const target = pickCardOfRarity(world, player, ci, to, { weightedByRemaining: false });
      if (target === null) { day.upgradesBlocked++; break; }
      // consume spares, biggest piles first
      let left = need;
      const sorted = [...list].sort((a, b) => player.owned[b] - player.owned[a]);
      for (const i of sorted) {
        while (left > 0 && player.owned[i] > 1) {
          player.owned[i]--;
          left--;
          if (world.model.upgradeReturns && isFinite_(world, from)) world.remaining[i]++;
        }
        if (!left) break;
      }
      if (player.owned[target] === 0) day.upgradesNewCard++;
      take(world, player, target);
      day.upgrades[from]++;
    }
  }
}

// A Pack is sold out when its pool can't fill even one slot (only possible for finite-pool draws).
function soldOut(world, ci) {
  if (world.model.draw !== "pool") return false;
  for (const r of RARITIES) if (poolSum(world, ci, r) > 0) return false;
  return true;
}

function isComplete(world, player, ci) {
  for (const r of ["common", "rare", "epic", "legendary"]) {
    for (const i of world.cols[ci].byRarity[r]) if (player.owned[i] === 0) return false;
  }
  return true;
}

function completion(world, player, ci) {
  let have = 0;
  for (const r of ["common", "rare", "epic", "legendary"]) {
    for (const i of world.cols[ci].byRarity[r]) if (player.owned[i] > 0) have++;
  }
  return have / world.cols[ci].size;
}

export function stepDay(world) {
  const day = emptyDay();
  world.day++;
  if (world.model.refillDays && world.day % world.model.refillDays === 0) {
    for (let i = 0; i < world.remaining.length; i++) world.remaining[i] = Math.max(world.remaining[i], world.total[i]);
  }
  if (world.model.topUp) topUpPools(world, day);
  for (const p of world.players) {
    // stochastic rounding of this player's share of the day's Packs
    const want = world.params.packsPerDay * p.share;
    let n = Math.floor(want) + (world.rand() < want % 1 ? 1 : 0);
    while (n-- > 0) {
      // A collector buys from the Collection they have least of — unless its Pack is sold out.
      let ci = -1, best = Infinity;
      world.cols.forEach((_, c) => {
        if (soldOut(world, c)) return;
        const v = completion(world, p, c);
        if (v < best) { best = v; ci = c; }
      });
      if (ci === -1) { day.soldOutPacks++; continue; }
      openPack(world, p, ci, day);
    }
    world.cols.forEach((_, ci) => {
      doUpgrades(world, p, ci, day);
      if (p.completedDay[ci] === null && isComplete(world, p, ci)) p.completedDay[ci] = world.day;
    });
  }
  world.history.push(snapshot(world, day));
  return world;
}

// Models G/H: once a day, the admin checks each pool and adds Rare/Epic Copies if it has skewed.
function topUpPools(world, day) {
  const { params } = world;
  world.cols.forEach((col, ci) => {
    let all = 0, rarePlus = 0;
    for (const r of RARITIES) { const s = poolSum(world, ci, r); all += s; if (r !== "common") rarePlus += s; }
    if (all === 0 || rarePlus / all >= params.topUpThreshold) return;
    for (const i of col.byRarity.rare) { world.remaining[i] += params.topUpRare; day.topUpCopies += params.topUpRare; }
    for (const i of col.byRarity.epic) { world.remaining[i] += params.topUpEpic; day.topUpCopies += params.topUpEpic; }
    day.topUps++;
  });
}

function snapshot(world, day) {
  const perCol = world.cols.map((col, ci) => {
    const left = {}, held = {};
    for (const r of RARITIES) {
      left[r] = isFinite_(world, r) ? poolSum(world, ci, r) : null;
      let h = world.inactiveOwned?.[col.id]?.[r] ?? 0;
      for (const p of world.players) for (const i of col.byRarity[r]) h += p.owned[i];
      held[r] = h;
    }
    const comps = world.players.map((p) => completion(world, p, ci));
    return {
      id: col.id, label: col.label, left, held,
      avgCompletion: comps.reduce((a, b) => a + b, 0) / comps.length,
      completed: world.players.filter((p) => p.completedDay[ci] !== null).length,
    };
  });
  return { day: world.day, ...day, perCol };
}

export function runModel(seedData, model, params = DEFAULT_PARAMS) {
  const world = createWorld(seedData, model, params);
  for (let d = 0; d < params.days; d++) stepDay(world);
  return world;
}

// ── Summary metrics for comparing models ─────────────────────────────────────
export function summarize(world) {
  const h = world.history.slice(1);
  const week = (from, to) => {
    const slice = h.filter((d) => d.day > from && d.day <= to);
    const pulls = slice.reduce((acc, d) => { for (const r of RARITIES) acc[r] += d.pulls[r]; return acc; },
      { common: 0, rare: 0, epic: 0, legendary: 0, special: 0 });
    const all = Object.values(pulls).reduce((a, b) => a + b, 0) || 1;
    return (pulls.rare + pulls.epic + pulls.legendary + pulls.special) / all;
  };
  const sum = (f) => h.reduce((a, d) => a + f(d), 0);
  const upgrades = sum((d) => d.upgrades.common + d.upgrades.rare + d.upgrades.epic);
  const last = world.history[world.history.length - 1];
  const first = world.history[0];
  const completionDays = world.cols.map((_, ci) => {
    const ds = world.players.map((p) => p.completedDay[ci]).filter((x) => x !== null && x > 0).sort((a, b) => a - b);
    return { newlyCompleted: ds.length, medianDay: ds.length ? ds[Math.floor(ds.length / 2)] : null };
  });
  return {
    model: world.model.id,
    rarePlusWeek1: week(0, 7),
    rarePlusLastWeek: week(world.day - 7, world.day),
    upgrades,
    upgradesNewShare: upgrades ? sum((d) => d.upgradesNewCard) / upgrades : 0,
    upgradesBlocked: sum((d) => d.upgradesBlocked),
    legendaryHeld: last.perCol.map((c) => c.held.legendary),
    legendaryHeldStart: first.perCol.map((c) => c.held.legendary),
    avgCompletionStart: first.perCol.map((c) => c.avgCompletion),
    avgCompletionEnd: last.perCol.map((c) => c.avgCompletion),
    completedStart: first.perCol.map((c) => c.completed),
    completedEnd: last.perCol.map((c) => c.completed),
    completionDays,
    pityHits: sum((d) => d.pityHits),
    topUps: sum((d) => d.topUps),
    topUpCopies: sum((d) => d.topUpCopies),
  };
}
