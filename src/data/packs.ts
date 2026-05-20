import gameContent from "../../data/game-content.json";
import type { GameContentJson } from "./buildCardCatalog";

export type PackType = "bronspack" | "silverpack" | "guldpack";

type PackConfig = {
  label: string;
  cardCount: number;
  price: number;
  rarityChances: Record<string, number>;
};

const content = gameContent as GameContentJson;

export const packConfigs = content.packConfigs as Record<PackType, PackConfig>;

export const dailyDiamonds: number = content.dailyDiamonds ?? 150;
