import { rarityOrder, type CardRarity } from "../data/cards";
import { rarityLabel } from "../data/rarity";
import type { RarityTotals } from "../types/game";

/** "1 Rare + 3 Common", rarest first. Empty totals give an empty string. */
export function formatRarityTotals(totals: RarityTotals): string {
  const parts = (Object.entries(totals) as [CardRarity, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => rarityOrder[a[0]] - rarityOrder[b[0]])
    .map(([rarity, n]) => `${n} ${rarityLabel[rarity]}`);
  return parts.join(" + ");
}

/** "Ny!" or "Har redan (×2)" for a Copy, from how many the recipient holds. */
export function copyStatusLabel(recipientOwned: number): string {
  return recipientOwned === 0 ? "Ny!" : `Har redan (×${recipientOwned})`;
}
