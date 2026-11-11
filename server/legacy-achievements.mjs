// The Achievement table as it was BEFORE the relaunch (replaced in #34), kept
// only so the relaunch migration (#47) can tell what players already claimed
// and what they had earned. Nothing in the running game uses this.
//
// Rewards below are the old payouts: the generic table was scaled to 10% of
// the nominal amounts, and SM 21-25 had its own hand-set table.

const REWARD_SCALE = 0.1;
const scaleReward = (reward) => Math.max(1, Math.round(reward * REWARD_SCALE));

const GLOBAL_MILESTONES = [
  { target: 10, reward: 50 },
  { target: 25, reward: 125 },
  { target: 50, reward: 250 },
  { target: 100, reward: 500 },
  { target: 200, reward: 1000 },
];

const COLLECTION_MILESTONES = [
  { target: 10, reward: 50 },
  { target: 25, reward: 100 },
  { target: 50, reward: 200 },
  { target: 100, reward: 400 },
  { target: 200, reward: 800 },
];

const RARITY_MILESTONES = {
  rare: { milestones: [{ target: 1, reward: 50 }, { target: 3, reward: 250 }, { target: 5, reward: 1000 }], allReward: 4000 },
  epic: { milestones: [{ target: 1, reward: 75 }, { target: 3, reward: 300 }, { target: 5, reward: 1200 }], allReward: 5000 },
  legendary: { milestones: [{ target: 1, reward: 100 }, { target: 3, reward: 1000 }], allReward: 10000 },
  special: { milestones: [], allReward: 100000 },
};

// Collections that had their own table in game-content.json, with final payouts.
const CUSTOM_TABLES = {
  sm2125: {
    packsOpened: [{ target: 1, reward: 10 }, { target: 25, reward: 50 }, { target: 100, reward: 200 }, { target: 500, reward: 1000 }],
    firstOfRarity: { rare: 50, epic: 150, legendary: 1000 },
    allOfRarity: { common: 500, rare: 1000, epic: 2000, legendary: 5000 },
    complete: 10000,
  },
};

function customDefinitions(collection, cards, config) {
  const defs = [];
  for (const { target, reward } of config.packsOpened ?? []) {
    defs.push({ id: `collection-packs-${collection.id}-${target}`, kind: "packs", collectionId: collection.id, target, reward });
  }
  for (const [rarity, reward] of Object.entries(config.firstOfRarity ?? {})) {
    if (!cards.some((c) => c.rarity === rarity)) continue;
    defs.push({ id: `collection-first-${collection.id}-${rarity}`, collectionId: collection.id, rarity, target: 1, reward });
  }
  for (const [rarity, reward] of Object.entries(config.allOfRarity ?? {})) {
    const total = cards.filter((c) => c.rarity === rarity).length;
    if (total === 0) continue;
    defs.push({ id: `collection-rarity-${collection.id}-${rarity}-all`, collectionId: collection.id, rarity, target: total, reward });
  }
  if (config.complete != null && cards.length > 0) {
    defs.push({ id: `collection-complete-${collection.id}`, collectionId: collection.id, target: cards.length, reward: config.complete });
  }
  return defs;
}

/** Every old Achievement for the given catalog: { id, collectionId?, rarity?, kind?, target, reward }. */
export function buildLegacyAchievementDefinitions(allCards, collections, customTables = CUSTOM_TABLES) {
  const defs = [];
  const totalUnique = new Set(allCards.map((c) => c.id)).size;

  for (const { target, reward } of GLOBAL_MILESTONES) {
    if (target >= totalUnique) continue;
    defs.push({ id: `unique-${target}`, target, reward: scaleReward(reward) });
  }
  defs.push({ id: "unique-all", target: totalUnique, reward: scaleReward(1000000) });

  for (const collection of collections) {
    const cards = allCards.filter((c) => c.collectionId === collection.id);
    if (cards.length === 0) continue;
    if (customTables[collection.id]) {
      defs.push(...customDefinitions(collection, cards, customTables[collection.id]));
      continue;
    }
    for (const { target, reward } of COLLECTION_MILESTONES) {
      if (target >= cards.length) continue;
      defs.push({ id: `collection-unique-${collection.id}-${target}`, collectionId: collection.id, target, reward: scaleReward(reward) });
    }
    defs.push({ id: `collection-complete-${collection.id}`, collectionId: collection.id, target: cards.length, reward: scaleReward(5000) });
    for (const [rarity, config] of Object.entries(RARITY_MILESTONES)) {
      const total = cards.filter((c) => c.rarity === rarity).length;
      if (total === 0) continue;
      for (const { target, reward } of config.milestones) {
        if (target >= total) continue;
        defs.push({ id: `collection-rarity-${collection.id}-${rarity}-${target}`, collectionId: collection.id, rarity, target, reward: scaleReward(reward) });
      }
      defs.push({ id: `collection-rarity-${collection.id}-${rarity}-all`, collectionId: collection.id, rarity, target: total, reward: scaleReward(config.allReward) });
    }
  }
  return defs;
}

/** Whether a player had earned an old Achievement. `packsOpened` is { collectionId: count }. */
export function legacyAchievementEarned(definition, ownedCardIdSet, allCards, packsOpened = {}) {
  if (definition.kind === "packs") return (packsOpened[definition.collectionId] ?? 0) >= definition.target;
  let pool = allCards;
  if (definition.collectionId) pool = pool.filter((c) => c.collectionId === definition.collectionId);
  if (definition.rarity) pool = pool.filter((c) => c.rarity === definition.rarity);
  return pool.filter((c) => ownedCardIdSet.has(c.id)).length >= definition.target;
}
