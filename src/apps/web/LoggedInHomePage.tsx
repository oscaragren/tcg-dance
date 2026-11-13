import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChestRewardModal } from "../../components/web/ChestRewardModal";
import { DiamondIcon } from "../../components/web/DiamondIcon";
import { WhatsNewSheet as WhatsNewSheetView } from "../../components/web/WhatsNewSheet";
import { ComebackSheet } from "../../components/web/ComebackSheet";
import { EventSheet } from "../../components/web/EventSheet";
import { HemDesktop } from "../../components/web/HemDesktop";
import { HemBanner, StreakTrack, WeeklyGoalTiles } from "../../components/web/HemParts";
import { ProgressRing } from "../../components/web/ProgressRing";
import { WaitingStrip } from "../../components/web/WaitingStrip";
import type { DanceCard } from "../../data/cards";
import { collections } from "../../data/packs";
import type { AnnouncementBanner, CollectionProgress, ComebackSummary, GameState, LeaderboardEntry, StarterResponse, WaitingItem, WhatsNewSheet, WeeklyGoal } from "../../types/game";
import {
  acceptTrade, dismissAnnouncementBanner, fetchAnnouncementBanner, claimAchievement, claimDailyDiamonds, claimWeeklyGoal,
  claimComebackGift, claimEventGift, claimStarterPack, claimStarterStep, collectChest, fetchStarter,
  fetchCollectionProgress, fetchComeback, fetchWhatsNew, markWhatsNewSeen, fetchGameState, markComebackSummarySeen, fetchLeaderboard, fetchWaiting, fetchWeeklyGoals,
} from "../../utils/gameApi";
import { useIsDesktop } from "../../utils/useMediaQuery";
import { useNow } from "../../utils/useNow";

type LoggedInHomePageProps = {
  username: string;
  userEmail: string;
};

/** Hem, layout B "Kompakt": everything fits on one 390×844 screen. */
export function LoggedInHomePage({ username, userEmail }: LoggedInHomePageProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [waiting, setWaiting] = useState<WaitingItem[]>([]);
  const [weeklyGoals, setWeeklyGoals] = useState<WeeklyGoal[]>([]);
  const [progress, setProgress] = useState<Record<string, CollectionProgress>>({});
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streakBonus, setStreakBonus] = useState<number | null>(null);
  const [eventOpen, setEventOpen] = useState(false);
  const [starter, setStarter] = useState<StarterResponse | null>(null);
  const [reward, setReward] = useState<{ label: string; diamonds: number; cards: DanceCard[] } | null>(null);
  const [comeback, setComeback] = useState<ComebackSummary | null>(null);
  const [whatsNew, setWhatsNew] = useState<WhatsNewSheet | null>(null);
  const [banner, setBanner] = useState<AnnouncementBanner | null>(null);
  const now = useNow(1000);
  const desktop = useIsDesktop();

  const reload = useCallback(async () => {
    const [state, items, goals, starterState] = await Promise.all([fetchGameState(), fetchWaiting(), fetchWeeklyGoals(), fetchStarter()]);
    setGameState(state);
    setStarter(starterState);
    setWaiting(items.items);
    setWeeklyGoals(goals.goals);
    // Before the Daily claim ends the absence; the server keeps showing it until dismissed.
    // "Det här är nytt" goes first; when it is due the server hides the Comeback summary.
    fetchWhatsNew()
      .then((w) => {
        setWhatsNew((prev) => prev ?? w.sheet);
        return w.sheet ? null : fetchComeback().then((r) => setComeback((prev) => prev ?? r.summary));
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    reload().catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda speldata."));
    for (const c of collections) {
      fetchCollectionProgress(c.id)
        .then((p) => setProgress((prev) => ({ ...prev, [c.id]: p })))
        .catch(() => undefined);
    }
    fetchAnnouncementBanner().then(setBanner).catch(() => undefined);
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
      else if (item.type === "weekly_goal") await claimWeeklyGoal(item.id);
      else if (item.type === "event_gift") await claimEventGift(item.id);
      else if (item.type === "comeback_gift") await claimComebackGift();
      else if (item.type === "starter_step") await claimStarterStep(item.id);
      else if (item.type === "starter_pack") {
        const result = await claimStarterPack();
        setReward({ label: item.label, diamonds: 0, cards: result.pulledCards });
      } else if (item.type === "chest") {
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

  async function handleClaimGoal(goal: WeeklyGoal) {
    const item = waiting.find((i) => i.type === "weekly_goal" && i.id === goal.id);
    if (item) await handleAct(item);
  }

  const daily = waiting.find((i) => i.type === "daily");
  const tiles = waiting.filter((i) => i.type !== "daily");
  const event = gameState?.event ?? null;
  const eventLive = event != null && Date.parse(event.endsAt) > now;
  const me = leaderboard.find((e) => e.username === username);
  const top = leaderboard.slice(0, 3).map((e) => e.username).join(", ");

  const dismissBanner = () => {
    if (!banner) return;
    const id = banner.announcementId;
    setBanner(null);
    dismissAnnouncementBanner(id).catch(() => undefined);
  };

  const overlays = (
    <>
      {reward && (
        <ChestRewardModal chestLabel={reward.label} diamondsAwarded={reward.diamonds} cards={reward.cards} onClose={() => setReward(null)} />
      )}
      {whatsNew && (
        <WhatsNewSheetView
          sheet={whatsNew}
          onClose={() => { markWhatsNewSeen().catch(() => undefined).finally(() => setWhatsNew(null)); }}
        />
      )}
      {comeback && !whatsNew && (
        <ComebackSheet
          summary={comeback}
          onClose={() => { markComebackSummarySeen().catch(() => undefined).finally(() => setComeback(null)); }}
        />
      )}
      {event && eventOpen && <EventSheet event={event} now={now} onClose={() => setEventOpen(false)} />}
    </>
  );

  if (desktop) {
    return (
      <>
        {overlays}
        <HemDesktop
          username={username}
          gameState={gameState}
          daily={daily?.type === "daily" ? daily : null}
          tiles={tiles}
          weeklyGoals={weeklyGoals}
          starter={starter}
          progress={progress}
          leaderboard={leaderboard}
          event={eventLive ? event : null}
          busyId={busyId}
          error={error}
          banner={banner}
          onDismissBanner={dismissBanner}
          streakBonus={streakBonus}
          onAct={(item) => void handleAct(item)}
          onClaimGoal={(g) => void handleClaimGoal(g)}
          onOpenEvent={() => setEventOpen(true)}
        />
      </>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-3 py-3">
      {overlays}

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

      <HemBanner banner={banner} onDismiss={dismissBanner} className="mx-4" />

      <WaitingStrip items={tiles} busyId={busyId} onAct={(item) => void handleAct(item)} />

      {/* Daily claim: one slim row, only on Hem. */}
      <div className="mx-4 flex items-center justify-between gap-3 rounded-xl border bg-surface px-3 py-2">
        <div className="min-w-0 text-sm">
          <p className="font-semibold">Dagliga diamanter</p>
          <StreakTrack
            position={gameState?.diamondStreak ?? 0}
            target={gameState?.diamondStreakTarget ?? 7}
            bonus={streakBonus}
          />
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

      {starter?.visible && (
        <section aria-label="Kom igång" className="mx-4 rounded-xl border bg-surface px-3 py-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-tertiary">Kom igång</h2>
          <ul className="mt-1 flex flex-col gap-1">
            {starter.steps.map((s) => (
              <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                <span className={s.claimed ? "text-secondary line-through" : ""}>{s.title}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs text-secondary">
                  {s.claimed ? "Hämtad" : s.done ? "Klar – hämta ovan" : <>+{s.reward} <span className="text-diamonds" aria-hidden><DiamondIcon /></span></>}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <WeeklyGoalTiles goals={weeklyGoals} busyId={busyId} onClaim={(g) => void handleClaimGoal(g)} />

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
        {me ? <>Du är <span className="font-semibold">#{me.rank}</span> · {me.points} p</> : "Topplista"}
        {top && <span className="text-secondary"> · topp: {top}</span>}
      </Link>
    </main>
  );
}
