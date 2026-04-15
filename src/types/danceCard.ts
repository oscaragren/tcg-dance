export type CardRarity = "legendary" | "epic" | "rare" | "common";

export interface DanceCard {
  id: string;
  name: string;
  rarity: CardRarity;
  /** Matches PNG stem under data/designs: firstname_lastname-firstname_lastname */
  designKey?: string;
}

export const rarityOrder: Record<CardRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  common: 3,
};
