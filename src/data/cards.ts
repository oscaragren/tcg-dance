import vote4danceRanking from "../../data/vote4dance-ranking.json";
import { buildCardCatalog, type GameContentJson, type Vote4DanceRankingJson } from "./buildCardCatalog";
import { rarityOrder, type CardRarity, type DanceCard } from "../types/danceCard";

export { rarityOrder };
export type { CardRarity, DanceCard };

export function cardById(id: string): DanceCard | undefined {
  return cards.find((card) => card.id === id);
}

const emptyGameContent: GameContentJson = {
  packConfigs: {},
  commonBenchCards: [],
};

export const cards: DanceCard[] = buildCardCatalog(
  emptyGameContent,
  vote4danceRanking as Vote4DanceRankingJson,
);
