import gameContent from "../../data/game-content.json";
import { cards, type CardRarity, type DanceCard } from "./cards";
import type { GameContentJson } from "./buildCardCatalog";

export type PackType = "bronspack" | "silverpack" | "guldpack" | "dagspack";

type PackConfig = {
  label: string;
  cardCount: number;
  rarityChances: Record<CardRarity, number>;
};

export const packConfigs = (gameContent as GameContentJson).packConfigs as Record<PackType, PackConfig>;

function drawRarity(chances: Record<CardRarity, number>): CardRarity {
  const roll = Math.random();
  let cursor = 0;
  const rarityOrderKeys: CardRarity[] = ["legendary", "epic", "rare", "common"];

  for (const rarity of rarityOrderKeys) {
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
