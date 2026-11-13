import type { CardRarity, DanceCard } from "./danceCard";

export type GameState = {
  ownedCardIds: string[];
  diamonds: number;
  lastDailyClaimDate: string | null;
  canClaimDailyDiamonds: boolean;
  /** Today's daily claim before any streak bonus — higher during events. */
  dailyDiamondsToday?: number;
  lastOpenedCards: DanceCard[];
  /** Consecutive days the daily diamonds have been claimed with no gap. */
  diamondStreak: number;
  /** Streak length that pays out the bonus (see ClaimDailyDiamondsResponse). */
  diamondStreakTarget: number;
};

export type ClaimDailyDiamondsResponse = {
  /** Total diamonds credited by this claim, including any streak bonus. */
  diamondsAwarded: number;
  /** 500 when this claim completed a 7-day streak, 0 otherwise. */
  streakBonusAwarded: number;
  diamondStreak: number;
  state: GameState;
};

/** One news item shown from the megaphone dropdown in the header. */
export type Announcement = {
  id: string;
  title: string;
  body: string;
  createdAt: string;
};

export type AnnouncementsResponse = {
  /** Newest first. */
  announcements: Announcement[];
  /** True when a newer announcement exists than the one this player last opened the dropdown after. */
  hasUnseen: boolean;
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

/** The profile page shows the player's real name; search and trades do not. */
export type PlayerProfileUser = UserSearchResult & {
  firstName: string | null;
  lastName: string | null;
};

export type PlayerProfile = {
  user: PlayerProfileUser;
  ownedCardIds: string[];
  cardsForTrade: CardForTrade[];
  isSelf: boolean;
};

export type MarketTraderForCard = { userId: string; username: string; quantity: number };

export type MarketTrader = {
  userId: string;
  username: string;
  cards: CardForTrade[];
  totalCards: number;
};

export type ChestType = "bronze" | "silver" | "gold";

export type ChestTypeConfig = {
  id: ChestType;
  label: string;
  price: number;
  waitHours: number;
  diamondMin: number;
  diamondMax: number;
};

export type Chest = {
  id: string;
  type: ChestType;
  label: string;
  boughtAt: string;
  readyAt: string;
  ready: boolean;
  /** Which slot it occupies: its own chest type, or the free universal slot. */
  slot: ChestType | "free";
};

/** A dedicated slot a player can buy — one per chest type, bought once. */
export type ChestSlotOption = {
  type: ChestType;
  label: string;
  /** Swedish name of the slot itself, e.g. "bronsplats". */
  slotLabel: string;
  price: number;
  owned: boolean;
};

export type ChestsResponse = {
  chests: Chest[];
  /** Free universal slots plus dedicated slots bought. */
  slots: number;
  maxSlots: number;
  freeSlots: number;
  slotTypes: ChestSlotOption[];
  /** Server's answer to "is there room for one more of this type right now?". */
  canStore: Record<ChestType, boolean>;
  types: ChestTypeConfig[];
};

export type ChestsMutationResponse = ChestsResponse & { state: GameState };

export type CollectChestResponse = ChestsMutationResponse & {
  chestType: ChestType;
  chestLabel: string;
  diamondsAwarded: number;
  cards: DanceCard[];
};

export type TradeStatus = "pending" | "accepted" | "rejected" | "cancelled" | "countered";

export type Achievement = {
  id: string;
  title: string;
  description: string;
  reward: number;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
  /** Set for achievements scoped to one collection; absent for global ones. */
  collectionId?: string;
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
  /** Set when this offer was made in reply to another; null for a first offer. */
  counterOfTradeId: string | null;
};
