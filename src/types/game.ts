import type { DanceCard } from "../data/cards";

export type GameState = {
  ownedCardIds: string[];
  lastClaimDate: string | null;
  canClaimDailyPack: boolean;
  lastOpenedCards: DanceCard[];
};

export type ClaimDailyPackResponse = {
  pulledCards: DanceCard[];
  state: GameState;
};
