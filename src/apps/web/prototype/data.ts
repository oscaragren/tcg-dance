// PROTOTYPE — throwaway. Mock player state for the key-screen prototype
// (wayfinder ticket "What should the key screens look like on a phone?").
// Real Card catalog, fake ownership. Nothing here touches the API.

import { cards, rarityOrder, type CardRarity, type DanceCard } from "../../../data/cards";
import { collections } from "../../../data/packs";

export { cards, collections, rarityOrder };
export type { CardRarity, DanceCard };

export const RARITIES: CardRarity[] = ["common", "rare", "epic", "legendary", "special"];

export const rarityLabel: Record<CardRarity, string> = {
  common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", special: "Special",
};

export const rarityText: Record<CardRarity, string> = {
  common: "text-gray-500", rare: "text-blue-600", epic: "text-purple-600",
  legendary: "text-amber-700", special: "text-fuchsia-700",
};
export const rarityBg: Record<CardRarity, string> = {
  common: "bg-gray-400", rare: "bg-blue-500", epic: "bg-purple-500",
  legendary: "bg-amber-500", special: "bg-fuchsia-500",
};
export const rarityFrame: Record<CardRarity, string> = {
  common: "from-gray-400 to-gray-600", rare: "from-blue-400 to-blue-600",
  epic: "from-purple-400 to-purple-600", legendary: "from-amber-400 to-amber-600",
  special: "from-rose-400 to-fuchsia-600",
};

/** Next Rarity up for Upgrade, and how many Duplicates it costs (Common→Rare = 500 per the economy ticket). */
export const upgradeRule: Partial<Record<CardRarity, { to: CardRarity; cost: number }>> = {
  common: { to: "rare", cost: 500 },
  rare: { to: "epic", cost: 20 },
  epic: { to: "legendary", cost: 10 },
};

// Deterministic PRNG so every reload shows the same fake player.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const ownChance: Record<CardRarity, number> = { common: 0.75, rare: 0.45, epic: 0.25, legendary: 0.08, special: 0.02 };
const maxCopies: Record<CardRarity, number> = { common: 9, rare: 4, epic: 3, legendary: 2, special: 1 };

function fakeOwnership(seed: number, scale = 1): Record<string, number> {
  const r = rng(seed);
  const out: Record<string, number> = {};
  for (const c of cards) {
    if (r() < ownChance[c.rarity] * scale) out[c.id] = 1 + Math.floor(r() * maxCopies[c.rarity]);
  }
  return out;
}

export const initialOwned = fakeOwnership(7);

/** Cards set to "Behåll" (opted out of trading). */
export const initialKeep = new Set<string>(
  cards.filter((c) => (initialOwned[c.id] ?? 0) > 1 && c.rarity !== "common").slice(0, 3).map((c) => c.id),
);

export type OtherPlayer = { id: string; name: string; owned: Record<string, number>; rank: number; legendaries: number };

const NAMES = ["Elsa B", "Linnea K", "Hugo S", "Maja L", "Ali R", "Saga N", "Oskar T", "Wilma F", "Theo J", "Alva P"];
export const otherPlayers: OtherPlayer[] = NAMES.map((name, i) => {
  const owned = fakeOwnership(100 + i * 13, 0.9 + (i % 3) * 0.1);
  const legendaries = cards.filter((c) => c.rarity === "legendary" && owned[c.id]).length;
  return { id: `p${i}`, name, owned, rank: 0, legendaries };
})
  .sort((a, b) => b.legendaries - a.legendaries)
  .map((p, i) => ({ ...p, rank: i + 1 }));

export function cardsIn(collectionId: string) {
  return cards.filter((c) => c.collectionId === collectionId);
}

export function sortCards(list: DanceCard[]) {
  return [...list].sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity] || a.name.localeCompare(b.name, "sv"));
}

/** Available for Trade = Duplicates (everything past the first Copy) unless Behåll. */
export function availableCount(owned: Record<string, number>, keep: Set<string>, id: string) {
  if (keep.has(id)) return 0;
  return Math.max(0, (owned[id] ?? 0) - 1);
}

export type Match = {
  player: OtherPlayer;
  theyGive: DanceCard[]; // their available Copies of Cards I'm missing
  iGive: DanceCard[]; // my available Copies of Cards they're missing
};

export function computeMatches(myOwned: Record<string, number>, myKeep: Set<string>): Match[] {
  const live = cards;
  return otherPlayers
    .map((player) => {
      const theyGive = live.filter((c) => !myOwned[c.id] && (player.owned[c.id] ?? 0) > 1);
      const iGive = live.filter((c) => !player.owned[c.id] && availableCount(myOwned, myKeep, c.id) > 0);
      return { player, theyGive: sortCards(theyGive), iGive: sortCards(iGive) };
    })
    .filter((m) => m.theyGive.length > 0)
    .sort((a, b) => Number(b.iGive.length > 0) - Number(a.iGive.length > 0) || b.theyGive.length - a.theyGive.length);
}

export const incomingTrades = [
  { id: "t1", from: otherPlayers[2], expiresInDays: 5 },
  { id: "t2", from: otherPlayers[5], expiresInDays: 1 },
];

export const weeklyGoals = [
  { id: "packs", label: "Öppna 10 Packs", progress: 10, target: 10, reward: 100 },
  { id: "upgrade", label: "Gör 1 Upgrade", progress: 0, target: 1, reward: 100 },
  { id: "trade", label: "Få ett nytt Card via Byte", progress: 0, target: 1, reward: 100 },
];

export type ChestSlot = { id: string; label: string; readyInMin: number | null };
export const initialChests: ChestSlot[] = [
  { id: "c1", label: "Guldkista", readyInMin: 0 },
  { id: "c2", label: "Silverkista", readyInMin: 134 },
  { id: "c3", label: "", readyInMin: null },
];

export const chestShop = [
  { id: "bronze", label: "Bronskista", price: 200, hours: 2, payout: "~300 💎" },
  { id: "silver", label: "Silverkista", price: 500, hours: 6, payout: "~750 💎" },
  { id: "gold", label: "Guldkista", price: 1500, hours: 24, payout: "~2 250 💎" },
];

export const activeEvent = { name: "GP Växjö", endsIn: "2 d 14 h", gift: 200 };

export function fmtMin(min: number) {
  if (min <= 0) return "Klar";
  const h = Math.floor(min / 60);
  return h ? `${h} h ${min % 60} min` : `${min} min`;
}

export function randomPack(collectionId: string): DanceCard[] {
  const pool = cardsIn(collectionId);
  const chances = collections.find((c) => c.id === collectionId)?.pack.rarityChances ?? {};
  const out: DanceCard[] = [];
  for (let i = 0; i < 5; i++) {
    let roll = Math.random();
    let rarity: CardRarity = "common";
    for (const r of ["legendary", "epic", "rare", "common"] as CardRarity[]) {
      const p = (chances as Record<string, number>)[r] ?? 0;
      if (roll < p) { rarity = r; break; }
      roll -= p;
    }
    const options = pool.filter((c) => c.rarity === rarity);
    const list = options.length ? options : pool;
    out.push(list[Math.floor(Math.random() * list.length)]);
  }
  return out;
}
