import { ChevronDown } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import type { DanceCard } from "../../types/danceCard";
import type { Chest, ChestsResponse } from "../../types/game";
import { buyChestSlot, collectChest, fetchChests } from "../../utils/gameApi";
import { ChestRewardModal } from "./ChestRewardModal";

const CHEST_EMOJI: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇" };

const CHEST_ACCENT: Record<string, string> = {
  bronze: "from-amber-700 to-amber-500",
  silver: "from-gray-400 to-gray-200",
  gold: "from-yellow-500 to-amber-300",
};

/** "3 tim 12 min" / "48 sek" — how long until a chest unlocks. */
function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} tim ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} sek`;
  return `${seconds} sek`;
}

type ChestsSectionProps = {
  /** Called after a chest is collected so the parent can refresh owned cards. */
  onCollected?: () => void;
};

export function ChestsSection({ onCollected }: ChestsSectionProps) {
  const [data, setData] = useState<ChestsResponse | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reward, setReward] = useState<{ label: string; diamonds: number; cards: DanceCard[] } | null>(null);

  useEffect(() => {
    fetchChests()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda kistor."))
      .finally(() => setIsLoading(false));
  }, []);

  // Drive the countdowns. One shared ticker rather than one per chest.
  useEffect(() => {
    const hasPending = (data?.chests ?? []).some((c) => Date.parse(c.readyAt) > Date.now());
    if (!hasPending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data]);

  async function handleCollect(chest: Chest) {
    setBusyId(chest.id);
    setError(null);
    try {
      const result = await collectChest(chest.id);
      setData(result);
      setReward({ label: result.chestLabel, diamonds: result.diamondsAwarded, cards: result.cards });
      onCollected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte öppna kistan.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBuySlot() {
    setBusyId("slot");
    setError(null);
    try {
      setData(await buyChestSlot());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte köpa kistplats.");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || !data) return null;

  const readyCount = data.chests.filter((c) => Date.parse(c.readyAt) <= now).length;
  const emptySlots = Math.max(0, data.slots - data.chests.length);

  return (
    <>
      {reward && (
        <ChestRewardModal
          chestLabel={reward.label}
          diamondsAwarded={reward.diamonds}
          cards={reward.cards}
          onClose={() => setReward(null)}
        />
      )}

      <section className="rounded-2xl border bg-white mb-10 overflow-hidden">
        <button
          onClick={() => setIsOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-3 p-6 text-left"
        >
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">Kistor</h2>
            <span className="text-xs text-gray-400">
              {data.chests.length} / {data.slots} platser
            </span>
            {readyCount > 0 && (
              <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold">
                {readyCount}
              </span>
            )}
          </div>
          <ChevronDown className={`w-5 h-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>

        {isOpen && (
          <div className="px-6 pb-6 space-y-4">
            <p className="text-sm text-gray-500">
              Kistor köps i <Link to="/handel" className="text-purple-600 hover:underline">Handel</Link> och låses upp
              efter en väntetid. Innehållet samlas in här.
            </p>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {data.chests.map((chest) => {
                const remaining = Date.parse(chest.readyAt) - now;
                const isReady = remaining <= 0;
                return (
                  <div
                    key={chest.id}
                    className={`rounded-xl border p-4 flex items-center gap-4 ${isReady ? "border-purple-300 bg-purple-50/50" : ""}`}
                  >
                    <div
                      className={`h-12 w-12 shrink-0 rounded-lg bg-gradient-to-br ${CHEST_ACCENT[chest.type] ?? "from-gray-400 to-gray-200"} flex items-center justify-center text-2xl`}
                      aria-hidden
                    >
                      {CHEST_EMOJI[chest.type] ?? "🎁"}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-sm">{chest.label}</div>
                      <div className="text-xs text-gray-500">
                        {isReady ? "Redo att öppnas!" : `Klar om ${formatRemaining(remaining)}`}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      disabled={!isReady || busyId === chest.id}
                      onClick={() => void handleCollect(chest)}
                      className={isReady ? "bg-purple-600 hover:bg-purple-700 text-white shrink-0" : "shrink-0"}
                      variant={isReady ? "default" : "outline"}
                    >
                      {busyId === chest.id ? "Öppnar..." : "Öppna"}
                    </Button>
                  </div>
                );
              })}

              {Array.from({ length: emptySlots }, (_, i) => (
                <div
                  key={`empty-${i}`}
                  className="rounded-xl border border-dashed border-gray-300 p-4 flex items-center gap-4 text-gray-400"
                >
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-gray-50 flex items-center justify-center text-xl" aria-hidden>
                    +
                  </div>
                  <div className="min-w-0 flex-1 text-sm">Ledig kistplats</div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link to="/handel">Köp kista</Link>
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-xl border bg-gray-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
              <div className="flex-1 text-sm">
                <div className="font-medium">Kistplatser: {data.slots} av {data.maxSlots}</div>
                <div className="text-xs text-gray-500">
                  {data.nextSlotPrice === null
                    ? "Du har max antal platser."
                    : `Nästa plats kostar ${data.nextSlotPrice.toLocaleString("sv-SE")} ◆.`}
                </div>
              </div>
              {data.nextSlotPrice !== null && (
                <Button
                  size="sm"
                  disabled={busyId === "slot"}
                  onClick={() => void handleBuySlot()}
                  className="bg-blue-600 hover:bg-blue-700 text-white shrink-0"
                >
                  {busyId === "slot" ? "Köper..." : `Köp plats (${data.nextSlotPrice.toLocaleString("sv-SE")} ◆)`}
                </Button>
              )}
            </div>
          </div>
        )}
      </section>
    </>
  );
}
