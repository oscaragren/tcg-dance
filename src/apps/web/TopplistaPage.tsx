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
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Topplista</h1>
            <p className="text-gray-600 mb-6">Logga in för att se topplistan.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-bold mb-3">Topplista</h1>
            <p className="text-gray-600">
              Spelare rankade efter totalt antal kort. Vid lika resultat avgör flest legendary, sedan epic, rare och common.
            </p>
          </div>

          {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

          {isLoading ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
              Laddar topplista...
            </div>
          ) : entries.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
              Inga spelare på topplistan ännu.
            </div>
          ) : (
            <ol className="rounded-2xl border bg-white divide-y overflow-hidden">
              {entries.map((entry) => {
                const isMe = entry.userId === currentUser.id;
                return (
                  <li
                    key={entry.userId}
                    className={`flex items-center gap-4 px-5 py-3 ${isMe ? "bg-purple-50" : ""}`}
                  >
                    <span className="w-8 shrink-0 text-center text-lg font-bold text-gray-500">
                      {MEDALS[entry.rank] ?? entry.rank}
                    </span>
                    <span className={`min-w-0 flex-1 ${isMe ? "font-semibold text-purple-700" : "text-gray-900"}`}>
                      <span className="truncate block">
                        {entry.username}
                        {isMe && <span className="ml-2 text-xs text-purple-500">(du)</span>}
                      </span>
                      <span className="text-[11px] text-gray-400">
                        {entry.legendary}L · {entry.epic}E · {entry.rare}R · {entry.common}C
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-semibold text-gray-700">
                      {entry.total} kort
                    </span>
                  </li>
                );
              })}
            </ol>
          )}
        </div>
      </div>
    </main>
  );
}
