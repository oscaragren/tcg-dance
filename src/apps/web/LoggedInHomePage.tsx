import { Flame } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChestRewardModal } from "../../components/web/ChestRewardModal";
import { DiamondIcon } from "../../components/web/DiamondIcon";
import { EventSheet } from "../../components/web/EventSheet";
import { ProgressRing } from "../../components/web/ProgressRing";
import { WaitingStrip } from "../../components/web/WaitingStrip";
import type { DanceCard } from "../../data/cards";
import { collections } from "../../data/packs";
import type { CollectionProgress, GameState, LeaderboardEntry, WaitingItem } from "../../types/game";
import {
  acceptTrade, claimAchievement, claimDailyDiamonds, collectChest,
  fetchCollectionProgress, fetchGameState, fetchLeaderboard, fetchWaiting,
} from "../../utils/gameApi";
import { useNow } from "../../utils/useNow";

type LoggedInHomePageProps = {
  username: string;
  userEmail: string;
};

/** Hem, layout B "Kompakt": everything fits on one 390×844 screen. */
export function LoggedInHomePage({ username, userEmail }: LoggedInHomePageProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [progress, setProgress] = useState<Record<string, CollectionProgress>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streakBonus, setStreakBonus] = useState<number | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [reward, setReward] = useState<{ label: string; diamonds: number; cards: DanceCard[] } | null>(null);
  const now = useNow(1000);

  const reload = useCallback(async () => {
    const [state, items] = await Promise.all([fetchGameState(), fetchWaiting()]);
    setGameState(state);
    setWaiting(items.items);
  }, []);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda speldata."));
    for (const c of collections) {
      fetchCollectionProgress(c.id)
        .then((p) => setProgress((prev) => ({ ...prev, [c.id]: p })))
        .catch(() => undefined);
    }
    fetchLeaderboard().then(setLeaderboard).catch(() => undefined);
  }, [reload, userEmail]);

  // Each tile calls the same API action its own screen uses.
  async function handleAct(item: WaitingItem) {
    if (busyId) return;
    setBusyId(item.id);
    setError(null);
    try {
      if (item.type === "trade") await acceptTrade(item.id);
      else if (item.type === "achievement") await claimAchievement(item.id);
      else if (item.type === "chest") {
        const result = await collectChest(item.id);
        setReward({ label: result.chestLabel, diamonds: result.diamondsAwarded, cards: result.cards });
      } else {
        const result = await claimDailyDiamonds();
        setStreakBonus(result.streakBonusAwarded > 0 ? result.streakBonusAwarded : null);
      }
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Något gick fel.");
    } finally {
      setBusyId(null);
    }
  }

  const daily = waiting.find((i) => i.type === "daily");
  const tiles = waiting.filter((i) => i.type !== "daily");
  const event = gameState?.event ?? null;
  const eventLive = event != null && Date.parse(event.endsAt) > now;
  const myRank = leaderboard.find((e) => e.username === username)?.rank;
  const top = leaderboard.slice(0, 3).map((e) => e.username).join(", ");

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 py-3">
      {reward && (
        <ChestRewardModal chestLabel={reward.label} diamondsAwarded={reward.diamonds} cards={reward.cards} onClose={() => setReward(null)} />
      )}
      {event && eventOpen && <EventSheet event={event} now={now} onClose={() => setEventOpen(false)} />}

      <header className="flex items-baseline justify-between px-4">
        <h1 className="font-display text-xl font-bold">Hej, {username}!</h1>
        <span className="flex items-center gap-1.5 text-lg font-bold text-diamonds">
          {gameState ? gameState.diamonds : "–"} <DiamondIcon />
        </span>
      </header>

      {error && <p className="px-4 text-sm text-danger">{error}</p>}

      {eventLive && event && (
        <button
          type="button"
          onClick={() => setEventOpen(true)}
          className="mx-4 flex items-center justify-between gap-2 rounded-xl border border-hairline-strong px-3 py-2 text-left text-sm"
        >
          <span className="truncate font-semibold">{event.label}</span>
          <span className="shrink-0 text-xs text-secondary">pågår · se belöningar</span>
        </button>
      )}

      <WaitingStrip items={tiles} busyId={busyId} onAct={(item) => void handleAct(item)} />

      {/* Daily claim: one slim row, only on Hem. */}
      <div className="mx-4 flex items-center justify-between gap-3 rounded-xl border bg-surface px-3 py-2">
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Dagliga diamanter</p>
          <p className="flex items-center gap-1 text-xs text-secondary">
            <Flame className="h-3.5 w-3.5 text-rarity-legendary" aria-hidden />
            {gameState?.diamondStreak ?? 0}/{gameState?.diamondStreakTarget ?? 7} dagar i rad
            {streakBonus ? ` · +${streakBonus} bonus!` : ""}
          </p>
        </div>
        {daily?.type === "daily" ? (
          <button
            type="button"
            onClick={() => void handleAct(daily)}
            disabled={busyId === daily.id}
            className="flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-accent-on disabled:opacity-60"
          >
            +{daily.diamonds} <DiamondIcon />
          </button>
        ) : (
          <span className="shrink-0 text-xs text-secondary">Hämtad idag</span>
        )}
      </div>

      {/* One progress ring per live Collection. */}
      <section aria-label="Samlingar" className="mx-4 rounded-xl border bg-surface px-2 py-3">
        <div className="flex gap-2">
          {collections.map((c) => {
            const p = progress[c.id]?.total;
            return <ProgressRing key={c.id} owned={p?.owned ?? 0} total={p?.total ?? 0} label={c.shortLabel ?? c.label} />;
          })}
        </div>
      </section>

      <Link to="/topplista" className="mx-4 rounded-xl border bg-surface px-3 py-2 text-sm">
        {myRank ? <>Du är <span className="font-semibold">#{myRank}</span></> : "Topplista"}
        {top && <span className="text-secondary"> · topp: {top}</span>}
      </Link>
    </main>
  );
}
