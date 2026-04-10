import type { DanceCard } from "./danceCard";

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
