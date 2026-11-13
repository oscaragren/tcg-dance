// One Achievement table, the same for every Collection. Rewards are the final
// payouts. Special cards are left out of everything here: a Collection is
// complete when every non-Special Card is owned (see GLOSSARY.md).
const FIRST_OF_RARITY = { rare: 50, epic: 150, legendary: 500 };
const EVERY_OF_RARITY = { common: 500, rare: 1000, epic: 2000, legendary: 3000 };
const FULL_COLLECTION = 5000;
const UNIQUE_MILESTONES = [
  { target: 10, reward: 5 },
  { target: 25, reward: 10 },
  { target: 50, reward: 20 },
  { target: 100, reward: 40 },
  { target: 200, reward: 80 },
];

const RARITY_LABEL = { common: "common", rare: "rare", epic: "epic", legendary: "legendary" };
const cap = (word) => word[0].toUpperCase() + word.slice(1);

function shortLabelFor(collection) {
  return collection.shortLabel ?? collection.label ?? collection.id;
}

export function buildAchievementDefinitions(allCards, collections) {
  const definitions = [];

  for (const collection of collections) {
    const cards = allCards.filter((c) => c.collectionId === collection.id && c.rarity !== "special");
    if (cards.length === 0) continue;
    const shortLabel = shortLabelFor(collection);
    const total = cards.length;

    for (const { target, reward } of UNIQUE_MILESTONES) {
      if (target >= total) continue;
      definitions.push({
        id: `collection-unique-${collection.id}-${target}`,
        title: `Samlare ${shortLabel}: ${target} unika kort`,
        description: `Samla ${target} unika kort från ${collection.label}.`,
        chip: `${target} kort`,
        collectionId: collection.id,
        target,
        reward,
      });
    }

    for (const [rarity, reward] of Object.entries(FIRST_OF_RARITY)) {
      if (!cards.some((c) => c.rarity === rarity)) continue;
      definitions.push({
        id: `collection-first-${collection.id}-${rarity}`,
        title: `Första ${RARITY_LABEL[rarity]}-kortet: ${shortLabel}`,
        description: `Få ditt första ${RARITY_LABEL[rarity]}-kort från ${collection.label}.`,
        chip: `Första ${cap(RARITY_LABEL[rarity])}`,
        collectionId: collection.id,
        rarity,
        target: 1,
        reward,
      });
    }

    for (const [rarity, reward] of Object.entries(EVERY_OF_RARITY)) {
      const rarityTotal = cards.filter((c) => c.rarity === rarity).length;
      if (rarityTotal === 0) continue;
      definitions.push({
        id: `collection-rarity-${collection.id}-${rarity}-all`,
        title: `Alla ${RARITY_LABEL[rarity]}-kort: ${shortLabel}`,
        description: `Samla alla ${rarityTotal} ${RARITY_LABEL[rarity]}-kort från ${collection.label}.`,
        chip: `Alla ${cap(RARITY_LABEL[rarity])}`,
        collectionId: collection.id,
        rarity,
        target: rarityTotal,
        reward,
      });
    }

    definitions.push({
      id: `collection-complete-${collection.id}`,
      title: `Komplett samling: ${shortLabel}`,
      description: `Samla alla ${total} unika kort i ${collection.label}.`,
      chip: "Komplett samling",
      collectionId: collection.id,
      target: total,
      reward: FULL_COLLECTION,
    });
  }

  return definitions;
}

export function computeAchievementProgress(definition, ownedCardIdSet, allCards) {
  let pool = allCards.filter((c) => c.collectionId === definition.collectionId && c.rarity !== "special");
  if (definition.rarity) pool = pool.filter((c) => c.rarity === definition.rarity);
  const owned = pool.filter((c) => ownedCardIdSet.has(c.id)).length;
  return { progress: Math.min(owned, definition.target), target: definition.target, complete: owned >= definition.target };
}
