import type { CardRarity } from "../types/danceCard";

export const rarityLabel: Record<CardRarity, string> = {
  special: "Special",
  legendary: "Legendary",
  epic: "Epic",
  rare: "Rare",
  common: "Common",
};

/** Shape pip drawn on a Card frame so Rarity never relies on colour alone. */
export const rarityPip: Record<CardRarity, string> = {
  common: "●",
  rare: "◆",
  epic: "▲",
  legendary: "★",
  special: "✦",
};

export const rarityColor = (rarity: CardRarity) => `var(--color-rarity-${rarity})`;
