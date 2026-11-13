import { Check } from "lucide-react";
import { useEffect, useState } from "react";
import type { Achievement } from "../../types/game";
import { claimAchievement, fetchAchievements } from "../../utils/gameApi";
import { DiamondIcon } from "./DiamondIcon";

type AchievementsSectionProps = {
  /** The Collection whose milestones to show. */
  collectionId: string;
};

/** The selected Collection's Achievements as milestone chips: done, claimable or not yet. */
export function AchievementsSection({ collectionId }: AchievementsSectionProps) {
  const [achievements, setAchievements] = useState<Achievement[]>([]);
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAchievements()
      .then(setAchievements)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda prestationer."));
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

  const milestones = achievements.filter((a) => a.collectionId === collectionId);
  if (milestones.length === 0 && !error) return null;

  return (
    <section aria-labelledby="milestones-heading">
      <h2 id="milestones-heading" className="mb-2 font-display text-lg font-semibold">Milstolpar</h2>
      {error && <p className="mb-2 text-sm text-danger">{error}</p>}
      <ul className="flex flex-wrap gap-2">
        {milestones.map((a) => {
          const base = "inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm";
          const reward = <span className="inline-flex items-center gap-1 text-xs font-semibold text-diamonds">+{a.reward} <DiamondIcon /></span>;
          return (
            <li key={a.id}>
              {a.claimed ? (
                <span className={`${base} text-secondary`} title={a.description}>
                  <Check className="h-4 w-4 text-success" aria-hidden /> {a.chip}
                  <span className="sr-only">, klar</span>
                </span>
              ) : a.complete ? (
                <button
                  type="button"
                  disabled={claimingId === a.id}
                  onClick={() => void handleClaim(a.id)}
                  title={a.description}
                  className={`${base} bg-accent text-accent-on font-medium`}
                >
                  {a.chip} {reward}
                  <span className="sr-only">, hämta</span>
                </button>
              ) : (
                <span className={`${base} text-tertiary`} title={a.description}>
                  {a.chip} <span className="text-xs tabular-nums">{a.progress}/{a.target}</span>
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
