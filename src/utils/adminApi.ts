export type AdminRarityStat = { total: number; remaining: number; bought: number };

export type AdminOverview = {
  userCount: number;
  totalOwnedCards: number;
  pool: {
    byRarity: Record<string, AdminRarityStat>;
    totalCards: number;
    totalRemaining: number;
    totalBought: number;
  };
};

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  /** Null for accounts registered before names became mandatory. */
  firstName: string | null;
  lastName: string | null;
  createdAt: string;
  diamonds: number;
  totalCards: number;
  uniqueCards: number;
};

export type AdminUserCards = {
  user: { id: string; username: string; email: string };
  cards: { cardId: string; count: number }[];
};

export type AdminPoolEntry = {
  cardId: string;
  collectionId: string;
  rarity: string;
  total: number;
  remaining: number;
  bought: number;
};

/** Why a trade or a pair of accounts was singled out. */
export type AdminTradeFlag = "gift" | "lopsided" | "very_lopsided" | "exclusive_pair";

export type AdminTrade = {
  id: string;
  status: string;
  createdAt: string;
  sender: { id: string; username: string };
  receiver: { id: string; username: string };
  offeredCardIds: string[];
  offeredDiamonds: number;
  requestedCardIds: string[];
  requestedDiamonds: number;
  /** Value handed over by each side, in the shared unit derived from the upgrade ladder. */
  senderValue: number;
  receiverValue: number;
  /** Positive when the sender came out ahead. */
  senderNet: number;
  /** Bigger side divided by smaller; null when one side gave nothing at all. */
  ratio: number | null;
  favours: "sender" | "receiver" | "even";
  flags: AdminTradeFlag[];
};

export type AdminTradePairUser = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
};

export type AdminTradePair = {
  key: string;
  userA: AdminTradePairUser;
  userB: AdminTradePairUser;
  tradeCount: number;
  lopsidedCount: number;
  /** Net value that has flowed to userA across all their accepted trades. */
  netValueToA: number;
  firstTradeAt: string;
  lastTradeAt: string;
  /** How many distinct people each account has ever traded with. */
  partnersA: number;
  partnersB: number;
  /** True when neither account has traded with anyone but the other. */
  exclusive: boolean;
  /** Percent of the less-committed account's trades that are with this partner. */
  concentration: number;
  signupGapMinutes: number | null;
  registeredTogether: boolean;
};

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { message?: string };
    if (json.message) return json.message;
  } catch {
    return "Oväntat serverfel.";
  }
  return "Oväntat serverfel.";
}

async function adminRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options?.headers ?? {}) },
    ...options,
  });
  if (!response.ok) throw new Error(await parseErrorMessage(response));
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function adminLogin(password: string): Promise<{ ok: true }> {
  return adminRequest<{ ok: true }>("/api/admin/login", {
    method: "POST",
    body: JSON.stringify({ password }),
  });
}

export async function adminLogout(): Promise<void> {
  await adminRequest<unknown>("/api/admin/logout", { method: "POST" });
}

export async function adminMe(): Promise<{ ok: true }> {
  return adminRequest<{ ok: true }>("/api/admin/me", { method: "GET" });
}

export async function fetchAdminOverview(): Promise<AdminOverview> {
  return adminRequest<AdminOverview>("/api/admin/overview", { method: "GET" });
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  return adminRequest<AdminUser[]>("/api/admin/users", { method: "GET" });
}

export async function fetchAdminUserCards(userId: string): Promise<AdminUserCards> {
  return adminRequest<AdminUserCards>(`/api/admin/users/${userId}/cards`, { method: "GET" });
}

export async function fetchAdminPool(): Promise<AdminPoolEntry[]> {
  return adminRequest<AdminPoolEntry[]>("/api/admin/pool", { method: "GET" });
}

export async function fetchAdminTrades(): Promise<AdminTrade[]> {
  return adminRequest<AdminTrade[]>("/api/admin/trades", { method: "GET" });
}

export async function fetchAdminTradePairs(): Promise<AdminTradePair[]> {
  return adminRequest<AdminTradePair[]>("/api/admin/trade-pairs", { method: "GET" });
}

export async function deleteAdminUser(userId: string): Promise<void> {
  await adminRequest<unknown>(`/api/admin/users/${userId}`, { method: "DELETE" });
}
