import gameContent from "../../data/game-content.json";
import type { CollectionConfig, GameContentJson } from "./buildCardCatalog";

const content = gameContent as GameContentJson;

export type { CollectionConfig };

export const collections: CollectionConfig[] = content.collections ?? [];

export const dailyDiamonds: number = content.dailyDiamonds ?? 150;
