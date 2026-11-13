// Achievement diamond rewards are scaled down to ~10% of their nominal value
// so that achievements top up a player's wallet without dwarfing pack prices.
const REWARD_SCALE = 0.1;
function scaleReward(reward) {
  return Math.max(1, Math.round(reward * REWARD_SCALE));
}

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
  rare: { label: "Rare", milestones: [{ target: 1, reward: 50 }, { target: 3, reward: 250 }, { target: 5, reward: 1000 }], allReward: 4000 },
  epic: { label: "Epic", milestones: [{ target: 1, reward: 75 }, { target: 3, reward: 300 }, { target: 5, reward: 1200 }], allReward: 5000 },
  legendary: { label: "Legendary", milestones: [{ target: 1, reward: 100 }, { target: 3, reward: 1000 }], allReward: 10000 },
  special: { label: "Special", milestones: [], allReward: 100000 },
};

function shortLabelFor(collection) {
  return collection.shortLabel ?? collection.label ?? collection.id;
}

const RARITY_LABEL = { common: "common", rare: "rare", epic: "epic", legendary: "legendary", special: "special" };

/**
 * Achievements for a collection that defines its own table in
 * game-content.json (`collection.achievements`). Rewards there are the final
 * payouts, so they are NOT run through scaleReward().
 *
 *   packsOpened:   [{ target, reward }]      — open N packs of this collection
 *   firstOfRarity: { rarity: reward }        — own your first card of a rarity
 *   allOfRarity:   { rarity: reward }        — own every card of a rarity
 *   complete:      reward                    — own every card in the collection
 */
function customCollectionAchievements(collection, allCards) {
  const config = collection.achievements;
  const shortLabel = shortLabelFor(collection);
  const collectionCards = allCards.filter((c) => c.collectionId === collection.id);
  const packLabel = collection.pack?.label ?? `${collection.label}-pack`;
  const definitions = [];

  for (const { target, reward } of config.packsOpened ?? []) {
    definitions.push({
      id: `collection-packs-${collection.id}-${target}`,
      title: `Packöppnare ${shortLabel}: ${target} pack`,
      description: target === 1 ? `Öppna ditt första ${packLabel}.` : `Öppna ${target} ${packLabel}.`,
      collectionId: collection.id,
      kind: "packs",
      target,
      reward,
    });
  }

  for (const [rarity, reward] of Object.entries(config.firstOfRarity ?? {})) {
    if (!collectionCards.some((c) => c.rarity === rarity)) continue;
    definitions.push({
      id: `collection-first-${collection.id}-${rarity}`,
      title: `Första ${RARITY_LABEL[rarity] ?? rarity}-kortet: ${shortLabel}`,
      description: `Få ditt första ${RARITY_LABEL[rarity] ?? rarity}-kort från ${collection.label}.`,
      collectionId: collection.id,
      rarity,
      target: 1,
      reward,
    });
  }

  for (const [rarity, reward] of Object.entries(config.allOfRarity ?? {})) {
    const rarityTotal = collectionCards.filter((c) => c.rarity === rarity).length;
    if (rarityTotal === 0) continue;
    definitions.push({
      id: `collection-rarity-${collection.id}-${rarity}-all`,
      title: `Alla ${RARITY_LABEL[rarity] ?? rarity}-kort: ${shortLabel}`,
      description: `Samla alla ${rarityTotal} ${RARITY_LABEL[rarity] ?? rarity}-kort från ${collection.label}.`,
      collectionId: collection.id,
      rarity,
      target: rarityTotal,
      reward,
    });
  }

  if (config.complete != null && collectionCards.length > 0) {
    definitions.push({
      id: `collection-complete-${collection.id}`,
      title: `Komplett samling: ${shortLabel}`,
      description: `Samla alla ${collectionCards.length} unika kort i ${collection.label}.`,
      collectionId: collection.id,
      target: collectionCards.length,
      reward: config.complete,
    });
  }

  return definitions;
}

export function buildAchievementDefinitions(allCards, collections) {
  const definitions = [];
  const totalUnique = new Set(allCards.map((c) => c.id)).size;

  for (const { target, reward } of GLOBAL_MILESTONES) {
    if (target >= totalUnique) continue;
    definitions.push({
      id: `unique-${target}`,
      title: `Samlare: ${target} unika kort`,
      description: `Samla ${target} unika kort.`,
      target,
      reward: scaleReward(reward),
    });
  }

  definitions.push({
    id: "unique-all",
    title: "Fullständig samling",
    description: `Samla alla ${totalUnique} unika kort.`,
    target: totalUnique,
    reward: scaleReward(1000000),
  });

  for (const collection of collections) {
    const collectionCardIds = allCards.filter((c) => c.collectionId === collection.id).map((c) => c.id);
    if (collectionCardIds.length === 0) continue;

    if (collection.achievements) {
      definitions.push(...customCollectionAchievements(collection, allCards));
      continue;
    }

    const shortLabel = shortLabelFor(collection);
    const collectionTotal = collectionCardIds.length;

    for (const { target, reward } of COLLECTION_MILESTONES) {
      if (target >= collectionTotal) continue;
      definitions.push({
        id: `collection-unique-${collection.id}-${target}`,
        title: `Samlare ${shortLabel}: ${target} unika kort`,
        description: `Samla ${target} unika kort från ${collection.label}.`,
        collectionId: collection.id,
        target,
        reward: scaleReward(reward),
      });
    }

    definitions.push({
      id: `collection-complete-${collection.id}`,
      title: `Klar kollektion: ${shortLabel}`,
      description: `Samla alla ${collectionTotal} kort i ${collection.label}.`,
      collectionId: collection.id,
      target: collectionTotal,
      reward: scaleReward(5000),
    });

    for (const [rarity, config] of Object.entries(RARITY_MILESTONES)) {
      const rarityTotal = allCards.filter((c) => c.collectionId === collection.id && c.rarity === rarity).length;
      if (rarityTotal === 0) continue;

      for (const { target, reward } of config.milestones) {
        if (target >= rarityTotal) continue;
        definitions.push({
          id: `collection-rarity-${collection.id}-${rarity}-${target}`,
          title: `${config.label} Samlare ${shortLabel}: ${target} unikt ${rarity} kort`,
          description: `Samla ${target} unika ${rarity}-kort från ${collection.label}.`,
          collectionId: collection.id,
          rarity,
          target,
          reward: scaleReward(reward),
        });
      }

      definitions.push({
        id: `collection-rarity-${collection.id}-${rarity}-all`,
        title: `${config.label} Samlare ${shortLabel}: alla unika ${rarity} kort`,
        description: `Samla alla ${rarityTotal} ${rarity}-kort från ${collection.label}.`,
        collectionId: collection.id,
        rarity,
        target: rarityTotal,
        reward: scaleReward(config.allReward),
      });
    }
  }

  return definitions;
}

export function computeAchievementProgress(definition, ownedCardIdSet, allCards, packsOpened = {}) {
  if (definition.kind === "packs") {
    const opened = packsOpened[definition.collectionId] ?? 0;
    return { progress: Math.min(opened, definition.target), target: definition.target, complete: opened >= definition.target };
  }

  let pool = allCards;
  if (definition.collectionId) pool = pool.filter((c) => c.collectionId === definition.collectionId);
  if (definition.rarity) pool = pool.filter((c) => c.rarity === definition.rarity);

  const poolIds = pool.map((c) => c.id);
  const owned = poolIds.filter((id) => ownedCardIdSet.has(id)).length;

  return { progress: owned, target: definition.target, complete: owned >= definition.target };
}
