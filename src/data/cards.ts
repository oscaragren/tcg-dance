import gameContent from "../../data/game-content.json";
import vote4danceRanking from "../../data/vote4dance-ranking.json";
import { buildCardCatalog, type GameContentJson, type Vote4DanceRankingJson } from "./buildCardCatalog";
import { rarityOrder, type CardRarity, type DanceCard } from "../types/danceCard";

export { rarityOrder };
export type { CardRarity, DanceCard };

export function cardById(id: string): DanceCard | undefined {
  return cards.find((card) => card.id === id);
}

const primaryCollectionId = (gameContent as GameContentJson).collections?.[0]?.id ?? "sm2026";

export const cards: DanceCard[] = buildCardCatalog(
  gameContent as GameContentJson,
  vote4danceRanking as Vote4DanceRankingJson,
  primaryCollectionId,
);
