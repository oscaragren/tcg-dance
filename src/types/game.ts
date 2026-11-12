import type { CardRarity, DanceCard } from "./danceCard";

export type GameState = {
  ownedCardIds: string[];
  /** Cards the player has set to Behåll (kept out of Trades). */
  keptCardIds: string[];
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
  /** Chest payout multiplier while the Event runs; null when unchanged. */
  chestMultiplier?: number | null;
  /** Login gift, claimed once per player from "Väntar på dig". */
  gift?: EventGift | null;
};

export type EventGift = { type: "diamonds"; amount: number } | { type: "chest"; chestType: string };

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

/** The dismissible Hem banner pointing at an Announcement. */
export type AnnouncementBanner = {
  announcementId: string;
  text: string;
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

/** The game's automatic pick for an Upgrade (Duplicates only, skipping Behåll). */
export type UpgradePick = {
  cost: number;
  needed: number;
  have: number;
  cardIds: string[];
  targetRarity: CardRarity;
  canUpgrade: boolean;
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
  common: 100,
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

/** A player with Copies Available for Trade of Cards the viewer is missing. */
export type TradeMatch = {
  userId: string;
  username: string;
  /** Available Copies of the viewer's Missing Cards. */
  theyCanGive: CardForTrade[];
  /** The viewer's Available Copies of Cards this player is missing. */
  youCanGive: CardForTrade[];
  /** Both sides have something to give: "Ni kan byta med varandra". */
  twoWay: boolean;
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
  /** Short milestone label for the chip in Samling, e.g. "Första Rare". */
  chip: string;
  reward: number;
  progress: number;
  target: number;
  complete: boolean;
  claimed: boolean;
  collectionId: string;
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

/** How many Copies of each Rarity one side of a Trade holds. */
export type RarityTotals = Partial<Record<CardRarity, number>>;

/** One Copy in a Trade, described for whoever receives it. */
export type TradeCopy = {
  cardId: string;
  /** Copies the recipient already holds: 0 is "Ny!", more is "Har redan (×N)". */
  recipientOwned: number;
  isNew: boolean;
  /** Requested side only: the receiver has not made this Copy Available for Trade ("Inte till byte"). */
  notForTrade?: boolean;
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
  offeredCopies: TradeCopy[];
  requestedCopies: TradeCopy[];
  offeredRarity: RarityTotals;
  requestedRarity: RarityTotals;
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
  | { type: "event_gift"; id: string; label: string; gift: EventGift }
  | { type: "daily"; id: "daily"; diamonds: number }
  | { type: "starter_pack"; id: "starter-pack"; collectionId: string; label: string }
  | { type: "starter_step"; id: string; title: string; reward: number }
  | { type: "comeback_gift"; id: "comeback-gift"; diamonds: number };

/** The one-time "Välkommen tillbaka" summary for a returning player. */
export type ComebackSummary = {
  awayDays: number;
  collections: { id: string; label: string; owned: number; total: number }[];
  events: { id: string; label: string; startsAt: string; endsAt: string }[];
};

/** The one-time "Det här är nytt" sheet for players who existed at the relaunch. Lines show only when > 0. */
export type WhatsNewSheet = { achievementPayout: number; cancelledTrades: number };

export type StarterStep = { id: string; title: string; reward: number; done: boolean; claimed: boolean };

/** The "Kom igång" checklist and the free Pack of a new player. */
export type StarterResponse = {
  /** False once every step is claimed (or for players who never get the checklist). */
  visible: boolean;
  steps: StarterStep[];
  freePack: { collectionId: string; label: string } | null;
};

export type WaitingResponse = { items: WaitingItem[] };
