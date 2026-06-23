import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../shared/ui/button";
import type { Achievement } from "../../types/game";
import { claimAchievement, fetchAchievements } from "../../utils/gameApi";

export function AchievementsSection() {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchAchievements()
      .then(setAchievements)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda prestationer."))
      .finally(() => setIsLoading(false));
  }, []);

  async function handleClaim(id: string) {
    setClaimingId(id);
    setError(null);
    try {
      const result = await claimAchievement(id);
      setAchievements(result.achievements);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte lösa in prestationen.");
    } finally {
      setClaimingId(null);
    }
  }

  if (isLoading) return null;

  const claimableCount = achievements.filter((a) => a.complete && !a.claimed).length;

  return (
    <section className="rounded-2xl border bg-white mb-10 overflow-hidden">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 p-6 text-left"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Prestationer</h2>
          {claimableCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
              {claimableCount}
            </span>
          )}
        </div>
        <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>

      {isOpen && (
        <div className="px-6 pb-6">
          <p className="text-sm text-gray-500 mb-4">Lös in prestationer för att tjäna diamanter.</p>

          {error && <p className="mb-3 text-sm text-red-600">{error}</p>}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {achievements.map((a) => {
              const pct = Math.min(100, Math.round((a.progress / a.target) * 100));
              return (
                <div key={a.id} className="rounded-lg border px-4 py-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{a.title}</div>
                      <div className="text-xs text-gray-500">{a.description}</div>
                    </div>
                    <div className="text-xs font-semibold text-blue-600 shrink-0">+{a.reward} ◆</div>
                  </div>

                  <div className="mt-2 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full ${a.complete ? "bg-green-500" : "bg-purple-500"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{a.progress} / {a.target}</span>
                    {a.claimed ? (
                      <span className="text-xs text-green-600 font-medium">Inlöst</span>
                    ) : a.complete ? (
                      <Button
                        size="sm"
                        disabled={claimingId === a.id}
                        onClick={() => handleClaim(a.id)}
                        className="bg-purple-600 hover:bg-purple-700 text-white h-7 px-3 text-xs"
                      >
                        {claimingId === a.id ? "Löser in..." : "Lös in"}
                      </Button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
