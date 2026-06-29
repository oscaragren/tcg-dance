import type { Achievement, BuyPackResponse, CardForTrade, CardPoolInfo, ClaimAchievementResponse, ClaimDailyDiamondsResponse, GameState, LeaderboardEntry, Trade, UpgradeResponse, UserSearchResult } from "../types/game";

async function parseErrorMessage(response: Response): Promise<string> {
  try {
    const json = (await response.json()) as { message?: string };
    if (json.message) {
      return json.message;
    }
  } catch {
    return "Unexpected server error.";
  }
  return "Unexpected server error.";
}

async function requestJson<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
    ...options,
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function fetchGameState(): Promise<GameState> {
  return requestJson<GameState>("/api/game/state", { method: "GET" });
}

export async function claimDailyDiamonds(): Promise<ClaimDailyDiamondsResponse> {
  return requestJson<ClaimDailyDiamondsResponse>("/api/game/claim-daily-diamonds", { method: "POST" });
}

export async function fetchCardPool(): Promise<CardPoolInfo> {
  return requestJson<CardPoolInfo>("/api/game/pool", { method: "GET" });
}

export async function buyPack(collectionId: string, quantity = 1): Promise<BuyPackResponse> {
  return requestJson<BuyPackResponse>("/api/game/buy-pack", {
    method: "POST",
    body: JSON.stringify({ collectionId, quantity }),
  });
}

export async function fetchMyCardsForTrade(): Promise<CardForTrade[]> {
  return requestJson<CardForTrade[]>("/api/game/cards-for-trade", { method: "GET" });
}

export async function saveCardsForTrade(items: CardForTrade[]): Promise<CardForTrade[]> {
  return requestJson<CardForTrade[]>("/api/game/cards-for-trade", {
    method: "POST",
    body: JSON.stringify({ items }),
  });
}

export async function getUserCardsForTrade(userId: string): Promise<{ cards: CardForTrade[] }> {
  return requestJson<{ cards: CardForTrade[] }>(`/api/users/${userId}/cards-for-trade`, { method: "GET" });
}

export async function searchUsers(q: string): Promise<UserSearchResult[]> {
  return requestJson<UserSearchResult[]>(`/api/users/search?q=${encodeURIComponent(q)}`, { method: "GET" });
}

export async function upgradeCards(cardIds: string[]): Promise<UpgradeResponse> {
  return requestJson<UpgradeResponse>("/api/game/upgrade", {
    method: "POST",
    body: JSON.stringify({ cardIds }),
  });
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return requestJson<LeaderboardEntry[]>("/api/leaderboard", { method: "GET" });
}

export async function fetchAchievements(): Promise<Achievement[]> {
  return requestJson<Achievement[]>("/api/achievements", { method: "GET" });
}

export async function claimAchievement(achievementId: string): Promise<ClaimAchievementResponse> {
  return requestJson<ClaimAchievementResponse>(`/api/achievements/${achievementId}/claim`, { method: "POST" });
}

export async function getUserCards(userId: string): Promise<{ ownedCardIds: string[] }> {
  return requestJson<{ ownedCardIds: string[] }>(`/api/users/${userId}/cards`, { method: "GET" });
}

export async function fetchMyTrades(): Promise<Trade[]> {
  return requestJson<Trade[]>("/api/trade", { method: "GET" });
}

export async function createTrade(payload: {
  receiverUserId: string;
  offeredCardIds: string[];
  offeredDiamonds: number;
  requestedCardIds: string[];
  requestedDiamonds: number;
}): Promise<{ tradeId: string }> {
  return requestJson<{ tradeId: string }>("/api/trade", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function acceptTrade(tradeId: string): Promise<{ state: GameState }> {
  return requestJson<{ state: GameState }>(`/api/trade/${tradeId}/accept`, { method: "POST" });
}

export async function rejectTrade(tradeId: string): Promise<void> {
  await requestJson<unknown>(`/api/trade/${tradeId}/reject`, { method: "POST" });
}

export async function cancelTrade(tradeId: string): Promise<void> {
  await requestJson<unknown>(`/api/trade/${tradeId}/cancel`, { method: "POST" });
}
