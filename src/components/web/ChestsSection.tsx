import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import type { DanceCard } from "../../types/danceCard";
import type { Chest, ChestSlotOption, ChestsResponse, ChestType } from "../../types/game";
import { buyChestSlot, collectChest, fetchChests, fetchGameState } from "../../utils/gameApi";
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
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [diamonds, setDiamonds] = useState<number | null>(null);
  const [reward, setReward] = useState<{ label: string; diamonds: number; cards: DanceCard[] } | null>(null);

  useEffect(() => {
    fetchChests()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda kistor."))
      .finally(() => setIsLoading(false));
  }, []);

  // Only so the slot buttons can say "för få diamanter" before the server does.
  // Every mutation below returns a fresh state, so this is fetched once.
  useEffect(() => {
    fetchGameState().then((state) => setDiamonds(state.diamonds)).catch(() => {});
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
      setDiamonds(result.state.diamonds);
      setReward({ label: result.chestLabel, diamonds: result.diamondsAwarded, cards: result.cards });
      onCollected?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte öppna kistan.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleBuySlot(type: ChestType) {
    setBusyId(`slot:${type}`);
    setError(null);
    try {
      const result = await buyChestSlot(type);
      setData(result);
      setDiamonds(result.state.diamonds);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte köpa kistplats.");
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || !data) return null;

  const readyCount = data.chests.filter((c) => Date.parse(c.readyAt) <= now).length;

  // One entry per slot the player owns that has nothing in it. The free slot
  // takes anything; a dedicated one only its own type.
  const occupied = new Set(data.chests.map((c) => c.slot));
  const emptySlots: { key: string; label: string; hint: string }[] = [];
  const freeInUse = data.chests.filter((c) => c.slot === "free").length;
  for (let i = freeInUse; i < data.freeSlots; i += 1) {
    emptySlots.push({ key: `free-${i}`, label: "Fri plats", hint: "Tar alla sorters kistor" });
  }
  for (const slot of data.slotTypes) {
    if (slot.owned && !occupied.has(slot.type)) {
      emptySlots.push({
        key: slot.type,
        label: capitalize(slot.slotLabel),
        hint: `Tar bara ${slot.label.toLowerCase()}`,
      });
    }
  }

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

      <section className="md:h-full rounded-2xl border bg-white overflow-hidden">
        <div className="flex items-center gap-2 p-6 pb-0">
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

        {(
          <div className="px-6 pb-6 pt-4 space-y-4">
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
                      <div className="text-[11px] text-gray-400">
                        {chest.slot === "free"
                          ? "Fri plats"
                          : capitalize(data.slotTypes.find((s) => s.type === chest.slot)?.slotLabel ?? "plats")}
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

              {emptySlots.map((slot) => (
                <div
                  key={`empty-${slot.key}`}
                  className="rounded-xl border border-dashed border-gray-300 p-4 flex items-center gap-4 text-gray-400"
                >
                  <div className="h-12 w-12 shrink-0 rounded-lg bg-gray-50 flex items-center justify-center text-xl" aria-hidden>
                    +
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{slot.label}</div>
                    <div className="text-[11px]">{slot.hint}</div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link to="/handel">Köp kista</Link>
                  </Button>
                </div>
              ))}
            </div>

            <div className="rounded-xl border bg-gray-50 p-4 space-y-3">
              <div className="text-sm">
                <div className="font-medium">Kistplatser: {data.slots} av {data.maxSlots}</div>
                <div className="text-xs text-gray-500">
                  Din fria plats tar vilken kista som helst. Utöver den kan du köpa en fast plats
                  per sort — en fast plats rymmer bara sin egen sorts kista.
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {data.slotTypes.map((slot) => (
                  <SlotPurchase
                    key={slot.type}
                    slot={slot}
                    diamonds={diamonds}
                    isBusy={busyId === `slot:${slot.type}`}
                    disabled={busyId !== null}
                    onBuy={() => void handleBuySlot(slot.type)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/** One dedicated-slot offer: bought once, permanent, its own chest type only. */
function SlotPurchase({ slot, diamonds, isBusy, disabled, onBuy }: {
  slot: ChestSlotOption;
  diamonds: number | null;
  isBusy: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  const canAfford = diamonds === null || diamonds >= slot.price;

  return (
    <div className="rounded-lg border bg-white p-3 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>{CHEST_EMOJI[slot.type] ?? "🎁"}</span>
        <div className="min-w-0">
          <div className="text-sm font-medium truncate">{capitalize(slot.slotLabel)}</div>
          <div className="text-[11px] text-gray-500">{slot.price.toLocaleString("sv-SE")} ◆</div>
        </div>
      </div>
      {slot.owned ? (
        <div className="text-xs font-medium text-green-600 mt-auto">✓ Köpt</div>
      ) : (
        <Button
          size="sm"
          disabled={disabled || !canAfford}
          onClick={onBuy}
          variant={canAfford ? "default" : "outline"}
          className={canAfford ? "bg-blue-600 hover:bg-blue-700 text-white mt-auto" : "mt-auto"}
        >
          {isBusy ? "Köper..." : canAfford ? "Köp plats" : "För få ◆"}
        </Button>
      )}
    </div>
  );
}
