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
