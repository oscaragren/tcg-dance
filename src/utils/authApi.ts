import type { AuthUser } from "../types/auth";

export const PASSWORD_REQUIREMENTS_MESSAGE =
  "Lösenordet måste vara minst 8 tecken och innehålla minst en stor bokstav, en liten bokstav och en siffra.";

export function isStrongPassword(password: string): boolean {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

type ApiAuthResponse = {
  user: AuthUser;
};

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

export async function registerUser(input: {
  username: string;
  email: string;
  password: string;
}): Promise<AuthUser> {
  const response = await requestJson<ApiAuthResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.user;
}

export async function loginUser(input: { email: string; password: string }): Promise<AuthUser> {
  const response = await requestJson<ApiAuthResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.user;
}

export async function logoutUser(): Promise<void> {
  const response = await fetch("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(await parseErrorMessage(response));
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  await requestJson("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  await requestJson("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, newPassword }),
  });
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const response = await fetch("/api/auth/me", {
    method: "GET",
    credentials: "include",
  });

  if (response.status === 401) {
    return null;
  }

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response));
  }

  const json = (await response.json()) as ApiAuthResponse;
  return json.user;
}
