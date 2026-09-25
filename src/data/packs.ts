import gameContent from "../../data/game-content.json";
import type { CollectionConfig, GameContentJson } from "./buildCardCatalog";

const content = gameContent as GameContentJson;

export type { CollectionConfig };

export const collections: CollectionConfig[] = content.collections ?? [];

/**
 * Can this collection's pack be bought at `now`? Mirrors isPackOnSale() in
 * server/index.mjs — the server is the real gate, this only drives the UI.
 */
export function isPackPurchasable(collection: CollectionConfig, now: number = Date.now()): boolean {
  const { pack } = collection;
  if (pack.purchasable === false) return false;
  if (pack.releaseAt) {
    const releaseMs = Date.parse(pack.releaseAt);
    if (Number.isFinite(releaseMs) && now < releaseMs) return false;
  }
  return true;
}

/** "Släpps kl 12:00" (same day) or "Släpps 26 sep kl 12:00"; null when there's no scheduled release. */
export function packReleaseLabel(collection: CollectionConfig, now: number = Date.now()): string | null {
  const releaseMs = collection.pack.releaseAt ? Date.parse(collection.pack.releaseAt) : NaN;
  if (!Number.isFinite(releaseMs) || now >= releaseMs) return null;
  const release = new Date(releaseMs);
  const time = release.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
  const sameDay =
    release.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }) ===
    new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  if (sameDay) return `Släpps idag kl ${time}`;
  const date = release.toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "Europe/Stockholm" });
  return `Släpps ${date} kl ${time}`;
}

/** Collections whose cards are live but whose pack isn't on sale yet. */
export const unreleasedPackCollections: CollectionConfig[] = collections.filter((c) => !isPackPurchasable(c));

/**
 * The newest collection (last in game-content.json) — what the start page
 * features and counts, whether or not its pack is on sale yet.
 */
export const featuredCollection: CollectionConfig | undefined = collections[collections.length - 1];

export const dailyDiamonds: number = content.dailyDiamonds ?? 150;
