import type { CardRarity, DanceCard } from "./danceCard";

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

export type UpgradeResponse = {
  upgradedCard: DanceCard;
  state: GameState;
};

export const upgradeTierTarget: Record<CardRarity, CardRarity | null> = {
  common: "rare",
  rare: "epic",
  epic: "legendary",
  legendary: null,
  special: null,
};

/** Cards required to upgrade, keyed by the source rarity being combined. */
export const upgradeCardsRequired: Record<CardRarity, number | null> = {
  common: 20,
  rare: 15,
  epic: 10,
  legendary: null,
  special: null,
};

export type UserSearchResult = { id: string; username: string };

export type CardForTrade = { cardId: string; quantity: number };

export type LeaderboardEntry = {
  rank: number;
  userId: string;
  username: string;
  total: number;
  legendary: number;
  epic: number;
  rare: number;
  common: number;
};

export type TradeStatus = "pending" | "accepted" | "rejected" | "cancelled";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  reward: number;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
};

export type ClaimAchievementResponse = {
  diamondsAwarded: number;
  achievements: Achievement[];
  state: GameState;
};

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
