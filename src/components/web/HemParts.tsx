import { Flame } from "lucide-react";
import type { AnnouncementBanner, WeeklyGoal } from "../../types/game";
import { OPEN_ANNOUNCEMENT_EVENT } from "./AnnouncementsMenu";
import { DiamondIcon } from "./DiamondIcon";

/** The 7-step Streak track in the Daily claim row; filled steps = current position. */
export function StreakTrack({ position, target, bonus }: { position: number; target: number; bonus: number | null }) {
  return (
    <div className="mt-1 flex items-center gap-1.5" role="img" aria-label={`Streak: steg ${position} av ${target}`}>
      <Flame className="h-3.5 w-3.5 shrink-0 text-rarity-legendary" aria-hidden />
      <div className="flex gap-1">
        {Array.from({ length: target }, (_, i) => (
          <span
            key={i}
            data-testid="streak-step"
            data-filled={i < position}
            className={`h-2 w-2 rounded-full ${i < position ? "bg-accent" : "bg-hairline-strong"}`}
          />
        ))}
      </div>
      <span className="text-xs text-secondary">
        {position}/{target}
        {bonus ? ` · +${bonus} bonus!` : ""}
      </span>
    </div>
  );
}

/** The three Weekly goals as small tiles; a finished one is claimed with a tap. */
export function WeeklyGoalTiles({ goals, busyId, onClaim }: { goals: WeeklyGoal[]; busyId: string | null; onClaim: (goal: WeeklyGoal) => void }) {
  if (goals.length === 0) return null;
  return (
    <section aria-label="Veckomål" className="mx-4">
      <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Veckomål</h2>
      <ul className="grid grid-cols-3 gap-2">
        {goals.map((g) => (
          <li key={g.id} data-testid="weekly-goal" className="flex flex-col justify-between rounded-xl border bg-surface p-2">
            <p className="text-xs font-semibold leading-tight">{g.title}</p>
            <div className="mt-2">
              <div className="h-1.5 overflow-hidden rounded-full bg-hairline-strong" role="progressbar" aria-valuemin={0} aria-valuemax={g.target} aria-valuenow={g.progress}>
                <div className="h-full bg-accent" style={{ width: `${(g.progress / g.target) * 100}%` }} />
              </div>
              {g.claimed ? (
                <p className="mt-1 text-xs text-secondary">Hämtad</p>
              ) : g.complete ? (
                <button
                  type="button"
                  onClick={() => onClaim(g)}
                  disabled={busyId === g.id}
                  className="mt-1 flex w-full items-center justify-center gap-1 rounded-lg bg-accent py-0.5 text-xs font-semibold text-accent-on disabled:opacity-60"
                >
                  +{g.reward} <DiamondIcon />
                </button>
              ) : (
                <p className="mt-1 flex items-center gap-1 text-xs text-secondary">
                  {g.progress}/{g.target} · +{g.reward} <span className="text-diamonds" aria-hidden><DiamondIcon /></span>
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Dismissible Announcement banner shared by the mobile and desktop Hem layouts. */
export function HemBanner({ banner, onDismiss, className = "" }: { banner: AnnouncementBanner | null; onDismiss: () => void; className?: string }) {
  if (!banner) return null;
  return (
    <div className={`flex items-center gap-2 rounded-xl border bg-surface px-3 py-2 ${className}`}>
      <button
        type="button"
        onClick={() => window.dispatchEvent(new CustomEvent(OPEN_ANNOUNCEMENT_EVENT, { detail: banner.announcementId }))}
        className="min-w-0 flex-1 text-left text-sm font-semibold"
      >
        {banner.text}
      </button>
      <button
        type="button"
        aria-label="Stäng"
        onClick={onDismiss}
        className="flex min-h-11 min-w-11 shrink-0 items-center justify-center text-secondary"
      >
        ×
      </button>
    </div>
  );
}
