import type { DanceCard } from "./danceCard";

export type GameState = {
  ownedCardIds: string[];
  diamonds: number;
  lastDailyClaimDate: string | null;
  canClaimDailyDiamonds: boolean;
  lastOpenedCards: DanceCard[];
};

export type ClaimDailyDiamondsResponse = {
  diamondsAwarded: number;
  state: GameState;
};

export type BuyPackResponse = {
  pulledCards: DanceCard[];
  state: GameState;
};

export type CardPoolInfo = Record<string, { totalCopies: number; copiesRemaining: number }>;
