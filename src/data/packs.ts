import { cards, type CardRarity, type DanceCard } from "./cards";

export type PackType = "bronspack" | "silverpack" | "guldpack" | "dagspack";

type PackConfig = {
  label: string;
  cardCount: number;
  rarityChances: Record<CardRarity, number>;
};

export const packConfigs: Record<PackType, PackConfig> = {
  bronspack: {
    label: "Bronspack",
    cardCount: 10,
    rarityChances: {
      legendary: 0.03,
      epic: 0.12,
      rare: 0.3,
      common: 0.55,
    },
  },
  silverpack: {
    label: "Silverpack",
    cardCount: 10,
    rarityChances: {
      legendary: 0.06,
      epic: 0.2,
      rare: 0.34,
      common: 0.4,
    },
  },
  guldpack: {
    label: "Guldpack",
    cardCount: 10,
    rarityChances: {
      legendary: 0.1,
      epic: 0.28,
      rare: 0.37,
      common: 0.25,
    },
  },
  dagspack: {
    label: "Dagspack",
    cardCount: 5,
    rarityChances: {
      legendary: 0.03,
      epic: 0.12,
      rare: 0.3,
      common: 0.55,
    },
  },
};

function drawRarity(chances: Record<CardRarity, number>): CardRarity {
  const roll = Math.random();
  let cursor = 0;
  const rarityOrder: CardRarity[] = ["legendary", "epic", "rare", "common"];

  for (const rarity of rarityOrder) {
    cursor += chances[rarity];
    if (roll <= cursor) {
      return rarity;
    }
  }

  return "common";
}

function drawCardByRarity(rarity: CardRarity): DanceCard {
  const pool = cards.filter((card) => card.rarity === rarity);
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

export function openPack(packType: PackType): DanceCard[] {
  const config = packConfigs[packType];
  const pulledCards: DanceCard[] = [];

  for (let i = 0; i < config.cardCount; i += 1) {
    const rarity = drawRarity(config.rarityChances);
    pulledCards.push(drawCardByRarity(rarity));
  }

  return pulledCards;
}
