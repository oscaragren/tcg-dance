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

export function cardById(id: string): DanceCard | undefined {
  return cards.find((card) => card.id === id);
}

export const cards: DanceCard[] = [
  {
    id: "1",
    name: "Henric Stillman & Joanna Stillman",
    rarity: "legendary",
    designKey: "henric_stillman-joanna_stillman",
  },
  {
    id: "2",
    name: "Oscar Ågren & Sofia Ärleskog",
    rarity: "epic",
    designKey: "oscar_ågren-sofia_ärleskog",
  },
  {
    id: "3",
    name: "Simon Jansson & Medelene Andersson",
    rarity: "rare",
    designKey: "simon_jansson-medelene_andersson",
  },
  {
    id: "4",
    name: "William Johansson & Rebecka Ärlestig",
    rarity: "common",
    designKey: "william_johansson-rebecka_ärlestig",
  },
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
