import gameContent from "../../data/game-content.json";
import vote4danceRanking from "../../data/vote4dance-ranking.json";
import { buildCardCatalog, type GameContentJson, type Vote4DanceRankingJson } from "./buildCardCatalog";
import { rarityOrder, type CardRarity, type DanceCard } from "../types/danceCard";

export { rarityOrder };
export type { CardRarity, DanceCard };

export function cardById(id: string): DanceCard | undefined {
  return cards.find((card) => card.id === id);
}

const content = gameContent as GameContentJson;
const collectionIds = content.collections?.length ? content.collections.map((c) => c.id) : ["sm2026"];

// Every collection's cards, in collection order — mirrors server/gameCatalog.mjs.
export const cards: DanceCard[] = collectionIds.flatMap((collectionId) =>
  buildCardCatalog(content, vote4danceRanking as Vote4DanceRankingJson, collectionId),
);
