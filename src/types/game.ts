import type { CardRarity, DanceCard } from "./danceCard";

export type GameState = {
  ownedCardIds: string[];
  diamonds: number;
  lastDailyClaimDate: string | null;
  canClaimDailyDiamonds: boolean;
  /** Today's daily claim before any streak bonus — higher during events. */
  dailyDiamondsToday?: number;
  lastOpenedCards: DanceCard[];
  /** Streak position on the 7-step track (a missed day leaves it unchanged). */
  diamondStreak: number;
  /** Streak length that pays out the bonus (see ClaimDailyDiamondsResponse). */
  diamondStreakTarget: number;
  /** The Event running right now, if any. */
  event?: GameEvent | null;
};

/** A time-limited Event and the rewards active while it runs. */
export type GameEvent = {
  id: string;
  label: string;
  startsAt: string;
  endsAt: string;
  /** Daily claim amount during the Event; null when it doesn't change. */
  dailyDiamonds: number | null;
  /** Shortened Chest wait in hours per Chest type; null when unchanged. */
  chestWaitHours: Partial<Record<string, number>> | null;
};

export type ClaimDailyDiamondsResponse = {
  /** Total diamonds credited by this claim, including any streak bonus. */
  diamondsAwarded: number;
  /** 500 when this claim reached the 7th step, 0 otherwise. */
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

/**
 * What players may know about a Collection's Card pool: sold out or not, and
 * which Rarities still have Copies. Never how many.
 */
export type CollectionAvailability = Record<
  string,
  { soldOut: boolean; rarityInStock: Partial<Record<CardRarity, boolean>> }
>;

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

/** One of the three Weekly goals; progress is capped at the target. */
export type WeeklyGoal = {
  id: string;
  title: string;
  reward: number;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
};

export type WeeklyGoalsResponse = {
  /** Stockholm date of the Monday this week started. */
  weekStart: string;
  goals: WeeklyGoal[];
};

export type ClaimWeeklyGoalResponse = WeeklyGoalsResponse & {
  diamondsAwarded: number;
  state: GameState;
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

/** Unique Cards owned out of all Cards. Special cards never count. */
export type ProgressCount = { owned: number; total: number };

export type CollectionProgress = {
  collectionId: string | null;
  total: ProgressCount;
  byRarity: Record<"common" | "rare" | "epic" | "legendary", ProgressCount>;
};

/** A Special card and who holds its single Copy. */
export type Trophy = {
  cardId: string;
  collectionId?: string;
  owner: { username: string; isYou: boolean } | null;
};

/** One thing the player can claim or act on right now ("Väntar på dig"). */
export type WaitingItem =
  | { type: "trade"; id: string; trade: Trade }
  | { type: "chest"; id: string; chest: Chest }
  | { type: "achievement"; id: string; achievement: Achievement }
  | { type: "weekly_goal"; id: string; goal: WeeklyGoal }
  | { type: "daily"; id: "daily"; diamonds: number };

export type WaitingResponse = { items: WaitingItem[] };
