export type AuthUser = {
  id: string;
  username: string;
  email: string;
  createdAt: string;
  /** Null only for accounts registered before names became mandatory. */
  firstName: string | null;
  lastName: string | null;
  /** False until both names are filled in; the app is blocked while it is. */
  profileComplete: boolean;
  /** ISO end time while a ban is running, else null. Banned = read-only. */
  bannedUntil: string | null;
  banReason: string | null;
};
