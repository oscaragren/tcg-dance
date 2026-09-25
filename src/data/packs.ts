import gameContent from "../../data/game-content.json";
import type { CollectionConfig, GameContentJson } from "./buildCardCatalog";

const content = gameContent as GameContentJson;

export type { CollectionConfig };

export const collections: CollectionConfig[] = content.collections ?? [];

/** Can this collection's pack be bought right now? */
export function isPackPurchasable(collection: CollectionConfig): boolean {
  return collection.pack.purchasable !== false;
}

/** Collections whose cards are live but whose pack isn't on sale yet. */
export const unreleasedPackCollections: CollectionConfig[] = collections.filter((c) => !isPackPurchasable(c));

/**
 * The newest collection (last in game-content.json) — what the start page
 * features and counts, whether or not its pack is on sale yet.
 */
export const featuredCollection: CollectionConfig | undefined = collections[collections.length - 1];

export const dailyDiamonds: number = content.dailyDiamonds ?? 150;
