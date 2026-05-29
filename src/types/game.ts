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

export type UserSearchResult = { id: string; username: string };

export type TradeStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type Trade = {
  id: string;
  status: TradeStatus;
  sender: UserSearchResult;
  receiver: UserSearchResult;
  offeredCardIds: string[];
  offeredDiamonds: number;
  requestedCardIds: string[];
  requestedDiamonds: number;
  createdAt: string;
};
