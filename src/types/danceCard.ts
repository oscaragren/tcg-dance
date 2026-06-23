export type CardRarity = "special" | "legendary" | "epic" | "rare" | "common";

export interface DanceCard {
  id: string;
  name: string;
  rarity: CardRarity;
  collectionId?: string;
  /** Abbreviated club name (förening). */
  club?: string;
  /** Dance style, e.g. "Bugg", "Lindy Hop". */
  danceStyle?: string;
  /** Matches image stem under data/designs, e.g. "ID-001" */
  designKey?: string;
  /** Vote4Dance position within its tier (if sourced from Vote4Dance). */
  rankingPosition?: number;
}

export const rarityOrder: Record<CardRarity, number> = {
  special: 0,
  legendary: 1,
  epic: 2,
  rare: 3,
  common: 4,
};
