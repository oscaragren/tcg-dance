import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import type { AuthUser } from "../../types/auth";
import type { LeaderboardEntry } from "../../types/game";
import { fetchLeaderboard } from "../../utils/gameApi";

type TopplistaPageProps = { currentUser: AuthUser | null };

const MEDALS: Record<number, string> = { 1: "🥇", 2: "🥈", 3: "🥉" };

export function TopplistaPage({ currentUser }: TopplistaPageProps) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(!!currentUser);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    setIsLoading(true);
    setError(null);
    fetchLeaderboard()
      .then(setEntries)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda topplistan."))
      .finally(() => setIsLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <main className="mx-auto max-w-md px-4 py-10 text-center">
        <h1 className="font-display text-2xl font-bold">Topplista</h1>
        <p className="mb-5 mt-2 text-secondary">Logga in för att se topplistan.</p>
        <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 py-3">
      <header className="px-4">
        <h1 className="font-display text-xl font-bold">Topplista</h1>
        <p className="text-sm text-secondary">
          Rankad efter antal unika kort. Vid lika avgör flest unika legendary, sedan epic och rare.
        </p>
      </header>

      {error && <p className="px-4 text-sm text-danger">{error}</p>}

      {isLoading ? (
        <div className="mx-4 rounded-xl border border-dashed border-hairline-strong bg-surface p-6 text-center text-secondary">
          Laddar topplista...
        </div>
      ) : entries.length === 0 ? (
        <div className="mx-4 rounded-xl border border-dashed border-hairline-strong bg-surface p-6 text-center text-secondary">
          Inga spelare på topplistan ännu.
        </div>
      ) : (
        <ol className="mx-4 divide-y overflow-hidden rounded-xl border bg-surface">
          {entries.map((entry) => {
            const isMe = entry.userId === currentUser.id;
            return (
              <li key={entry.userId} className={isMe ? "bg-raised" : ""}>
                <Link
                  to={`/spelare/${entry.userId}`}
                  className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-raised"
                >
                  <span className="w-8 shrink-0 text-center font-display text-lg font-bold tabular-nums text-secondary">
                    {MEDALS[entry.rank] ?? entry.rank}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate ${isMe ? "font-semibold" : ""}`}>
                      {entry.username}
                      {isMe && <span className="ml-2 text-xs text-secondary">(du)</span>}
                    </span>
                    <span className="text-[11px] text-tertiary">
                      {entry.legendary} legendary · {entry.epic} epic · {entry.rare} rare
                    </span>
                  </span>
                  <span className="shrink-0 font-display text-lg font-bold tabular-nums">
                    {entry.total} <span className="text-xs font-normal text-secondary">kort</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </main>
  );
}
