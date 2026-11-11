import { Link } from "react-router-dom";
import type { CollectionProgress, GameEvent, GameState, LeaderboardEntry, StarterResponse, WaitingItem, WeeklyGoal } from "../../types/game";
import { collections } from "../../data/packs";
import { CollectionScoreboard } from "./CollectionScoreboard";
import { DiamondIcon } from "./DiamondIcon";
import { StreakTrack, WeeklyGoalTiles } from "./HemParts";
import { WaitingStrip } from "./WaitingStrip";

type DailyItem = Extract<WaitingItem, { type: "daily" }>;

type HemDesktopProps = {
  username: string;
  gameState: GameState | null;
  daily: DailyItem | null;
  /** "Väntar på dig" items (the Daily claim is shown in the Dagens panel instead). */
  tiles: WaitingItem[];
  weeklyGoals: WeeklyGoal[];
  starter: StarterResponse | null;
  progress: Record<string, CollectionProgress>;
  leaderboard: LeaderboardEntry[];
  /** The live Event, or null. */
  event: GameEvent | null;
  busyId: string | null;
  error: string | null;
  streakBonus: number | null;
  onAct: (item: WaitingItem) => void;
  onClaimGoal: (goal: WeeklyGoal) => void;
  onOpenEvent: () => void;
};

const H2 = "text-xs font-semibold uppercase tracking-wider text-tertiary";

/** Hem at ≥1024px, layout C "Instrument": the same parts as the phone, laid out as a dashboard grid. */
export function HemDesktop(p: HemDesktopProps) {
  const top5 = p.leaderboard.slice(0, 5);
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-5">
      <header className="flex items-baseline justify-between">
        <h1 className="font-display text-2xl font-bold">Hej, {p.username}!</h1>
        <span className="flex items-center gap-1.5 text-lg font-bold text-diamonds">
          {p.gameState ? p.gameState.diamonds : "–"} <DiamondIcon />
        </span>
      </header>

      {p.error && <p className="text-sm text-danger">{p.error}</p>}

      {p.event && (
        <button
          type="button"
          onClick={p.onOpenEvent}
          className="flex items-center justify-between gap-2 rounded-xl border border-hairline-strong px-4 py-3 text-left"
        >
          <span className="truncate font-semibold">{p.event.label}</span>
          <span className="shrink-0 text-sm text-secondary">pågår · se belöningar</span>
        </button>
      )}

      <div className="grid grid-cols-12 gap-4">
        <section aria-label="Dagens" className="col-span-4 flex flex-col gap-3 rounded-xl border bg-surface p-4 [&_section]:mx-0">
          <h2 className={H2}>Dagens</h2>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">Dagliga diamanter</p>
              <StreakTrack position={p.gameState?.diamondStreak ?? 0} target={p.gameState?.diamondStreakTarget ?? 7} bonus={p.streakBonus} />
            </div>
            {p.daily ? (
              <button
                type="button"
                onClick={() => p.onAct(p.daily!)}
                disabled={p.busyId === p.daily.id}
                className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-on disabled:opacity-60"
              >
                +{p.daily.diamonds} <DiamondIcon />
              </button>
            ) : (
              <span className="shrink-0 text-xs text-secondary">Hämtad idag</span>
            )}
          </div>
          <WeeklyGoalTiles goals={p.weeklyGoals} busyId={p.busyId} onClaim={p.onClaimGoal} />
          {p.starter?.visible && (
            <section aria-label="Kom igång">
              <h2 className={H2}>Kom igång</h2>
              <ul className="mt-1 flex flex-col gap-1">
                {p.starter.steps.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className={s.claimed ? "text-secondary line-through" : ""}>{s.title}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs text-secondary">
                      {s.claimed ? "Hämtad" : s.done ? "Klar – hämta till höger" : <>+{s.reward} <span className="text-diamonds" aria-hidden><DiamondIcon /></span></>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </section>

        <div className="col-span-8 rounded-xl border bg-surface p-4">
          {p.tiles.length > 0 ? (
            <WaitingStrip items={p.tiles} busyId={p.busyId} onAct={p.onAct} layout="grid" />
          ) : (
            <>
              <h2 className={H2}>Väntar på dig</h2>
              <p className="mt-2 text-sm text-secondary">Inget väntar just nu.</p>
            </>
          )}
        </div>

        <section aria-label="Samlingar" className="col-span-8 grid grid-cols-2 gap-4">
          {collections.map((c) => {
            const total = p.progress[c.id]?.total;
            const pct = total && total.total > 0 ? Math.round((100 * total.owned) / total.total) : 0;
            return (
              <Link key={c.id} to="/samling" className="rounded-xl border bg-surface p-4 hover:border-hairline-strong">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-display text-lg font-bold">{c.label}</span>
                  <span className="shrink-0 text-sm tabular-nums text-secondary">{total?.owned ?? 0}/{total?.total ?? 0}</span>
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-hairline-strong" role="progressbar" aria-label={c.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                  <div className="h-full bg-accent" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-3"><CollectionScoreboard progress={p.progress[c.id]} /></div>
              </Link>
            );
          })}
        </section>

        <section aria-label="Topplista" className="col-span-4 rounded-xl border bg-surface p-4">
          <div className="flex items-baseline justify-between">
            <h2 className={H2}>Topplista</h2>
            <Link to="/topplista" className="text-xs text-secondary hover:underline">Visa alla</Link>
          </div>
          <ol className="mt-2 divide-y divide-hairline">
            {top5.map((e) => (
              <li key={e.userId} className={`flex items-center justify-between gap-2 py-1.5 text-sm ${e.username === p.username ? "font-semibold text-accent" : ""}`}>
                <span className="truncate">{e.rank}. {e.username}</span>
                <span className="shrink-0 tabular-nums text-secondary">{e.total} unika kort</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
