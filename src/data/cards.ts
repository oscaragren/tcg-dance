import gameContent from "../../data/game-content.json";
import vote4danceRanking from "../../data/vote4dance-ranking.json";
import {
  buildCardCatalog,
  type GameContentJson,
  type Vote4DanceRankingJson,
} from "./buildCardCatalog";

export type { CardRarity, DanceCard } from "../types/danceCard";
export { rarityOrder } from "../types/danceCard";

export const cards = buildCardCatalog(
  gameContent as GameContentJson,
  vote4danceRanking as Vote4DanceRankingJson,
);
