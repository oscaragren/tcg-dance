export type CardRarity = "legendary" | "epic" | "rare" | "common";

export interface DanceCard {
  id: string;
  name: string;
  rarity: CardRarity;
}

export const rarityOrder: Record<CardRarity, number> = {
  legendary: 0,
  epic: 1,
  rare: 2,
  common: 3,
};

export const cards: DanceCard[] = [
  { id: "1", name: "Alice", rarity: "legendary" },
  { id: "2", name: "Bob", rarity: "epic" },
  { id: "3", name: "Charlie", rarity: "rare" },
  { id: "4", name: "Diana", rarity: "common" },
  { id: "5", name: "Ella", rarity: "epic" },
  { id: "6", name: "Felix", rarity: "legendary" },
  { id: "7", name: "Greta", rarity: "rare" },
  { id: "8", name: "Hugo", rarity: "common" },
  { id: "9", name: "Ida", rarity: "rare" },
  { id: "10", name: "Johan", rarity: "epic" },
  { id: "11", name: "Kajsa", rarity: "legendary" },
  { id: "12", name: "Leo", rarity: "common" },
  { id: "13", name: "Maja", rarity: "rare" },
  { id: "14", name: "Noah", rarity: "epic" },
  { id: "15", name: "Olivia", rarity: "common" },
  { id: "16", name: "Pelle", rarity: "rare" },
  { id: "17", name: "Quinn", rarity: "common" },
  { id: "18", name: "Ruben", rarity: "epic" },
  { id: "19", name: "Sara", rarity: "legendary" },
  { id: "20", name: "Ture", rarity: "rare" },
  { id: "21", name: "Ulrika", rarity: "common" },
  { id: "22", name: "Vera", rarity: "epic" },
  { id: "23", name: "William", rarity: "rare" },
  { id: "24", name: "Ylva & Zack", rarity: "legendary" },
];
