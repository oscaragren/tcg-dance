import type { BuyPackResponse, CardPoolInfo, ClaimDailyDiamondsResponse, GameState } from "../types/game";

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

export async function buyPack(packId: string): Promise<BuyPackResponse> {
  return requestJson<BuyPackResponse>("/api/game/buy-pack", {
    method: "POST",
    body: JSON.stringify({ packId }),
  });
}
