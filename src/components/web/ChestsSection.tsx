import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Button } from "../shared/ui/button";
import type { DanceCard } from "../../types/danceCard";
import type { Chest, ChestSlotOption, ChestsResponse, ChestType, GameState } from "../../types/game";
import { buyChest, buyChestSlot, collectChest, fetchChests } from "../../utils/gameApi";
import { ChestRewardModal } from "./ChestRewardModal";
import { DiamondIcon } from "./DiamondIcon";

const CHEST_EMOJI: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇" };

/** "3 tim 12 min" / "48 sek": how long until a Chest unlocks. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours} tim ${minutes} min`;
  if (minutes > 0) return `${minutes} min ${seconds} sek`;
  return `${seconds} sek`;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

type SlotTile =
  | { kind: "chest"; chest: Chest }
  | { kind: "empty"; key: string; label: string };

/** One tile per slot the player owns: a Chest in it, or empty. */
function slotTiles(data: ChestsResponse): SlotTile[] {
  const tiles: SlotTile[] = data.chests.map((chest) => ({ kind: "chest", chest }));
  const freeInUse = data.chests.filter((c) => c.slot === "free").length;
  for (let i = freeInUse; i < data.freeSlots; i += 1) {
    tiles.push({ kind: "empty", key: `free-${i}`, label: "Fri plats" });
  }
  const occupied = new Set(data.chests.map((c) => c.slot));
  for (const slot of data.slotTypes) {
    if (slot.owned && !occupied.has(slot.type)) {
      tiles.push({ kind: "empty", key: slot.type, label: capitalize(slot.slotLabel) });
    }
  }
  return tiles;
}

type ChestsSectionProps = {
  diamonds: number;
  /** Every mutation returns a fresh GameState; the parent keeps its own in sync. */
  onState: (state: GameState) => void;
};

/**
 * Kistor, in Butik: slot tiles (ready, counting down, empty) with Hämta, then
 * the Chests and slots you can buy.
 */
export function ChestsSection({ diamonds, onState }: ChestsSectionProps) {
  const [data, setData] = useState<ChestsResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [reward, setReward] = useState<{ label: string; diamonds: number; cards: DanceCard[] } | null>(null);

  useEffect(() => {
    fetchChests()
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda kistor."));
  }, []);

  // One shared ticker drives every countdown.
  useEffect(() => {
    const hasPending = (data?.chests ?? []).some((c) => Date.parse(c.readyAt) > Date.now());
    if (!hasPending) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [data]);

  async function run<T extends ChestsResponse & { state: GameState }>(id: string, fallback: string, action: () => Promise<T>) {
    if (busyId) return;
    setBusyId(id);
    setError(null);
    setNotice(null);
    try {
      const result = await action();
      setData(result);
      onState(result.state);
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : fallback);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCollect(chest: Chest) {
    const result = await run(chest.id, "Kunde inte hämta kistan.", () => collectChest(chest.id));
    if (result) setReward({ label: result.chestLabel, diamonds: result.diamondsAwarded, cards: result.cards });
  }

  async function handleBuyChest(type: ChestType, label: string) {
    const result = await run(`chest:${type}`, "Kunde inte köpa kistan.", () => buyChest(type));
    if (result) setNotice(`${label} köpt! Den är klar när tiden gått ut.`);
  }

  async function handleBuySlot(type: ChestType) {
    await run(`slot:${type}`, "Kunde inte köpa kistplats.", () => buyChestSlot(type));
  }

  if (!data) return error ? <p className="text-sm text-danger">{error}</p> : null;

  const tiles = slotTiles(data);

  return (
    <section className="space-y-4">
      {reward && (
        <ChestRewardModal
          chestLabel={reward.label}
          diamondsAwarded={reward.diamonds}
          cards={reward.cards}
          onClose={() => setReward(null)}
        />
      )}

      <div>
        <h2 className="font-display text-2xl font-bold">Kistor</h2>
        <p className="text-sm text-secondary">
          Köp en kista, vänta ut klockan och hämta den. {data.chests.length} / {data.slots} platser upptagna.
        </p>
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}
      {notice && <p className="text-sm text-success">{notice}</p>}

      <div className="grid grid-cols-3 gap-2">
        {tiles.map((tile) => {
          if (tile.kind === "empty") {
            return (
              <div
                key={tile.key}
                className="flex aspect-square flex-col items-center justify-center rounded-xl border-2 border-dashed border-hairline-strong p-2 text-center text-xs text-tertiary"
              >
                {tile.label}
                <span>Tom plats</span>
              </div>
            );
          }
          const { chest } = tile;
          const remaining = Date.parse(chest.readyAt) - now;
          const ready = remaining <= 0;
          return (
            <div
              key={chest.id}
              className={`flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border-2 p-2 text-center ${ready ? "border-success bg-raised" : "border-hairline-strong"}`}
            >
              <span className="text-3xl" aria-hidden>{CHEST_EMOJI[chest.type] ?? "🎁"}</span>
              <span className="text-[11px] font-medium">{chest.label}</span>
              {ready ? (
                <Button
                  size="sm"
                  disabled={busyId !== null}
                  onClick={() => void handleCollect(chest)}
                  className="h-8 bg-accent px-3 text-xs text-accent-on hover:bg-accent/90"
                >
                  {busyId === chest.id ? "Hämtar..." : "Hämta"}
                </Button>
              ) : (
                <span className="flex items-center gap-1 text-[11px] text-secondary">
                  <Clock className="h-3 w-3" aria-hidden />
                  {formatRemaining(remaining)}
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary">Köp kista</h3>
        {data.types.map((chest) => {
          const canAfford = diamonds >= chest.price;
          // The server decides whether this type fits: its own slot, or the free one.
          const hasRoom = data.canStore[chest.id];
          const enabled = canAfford && hasRoom;
          return (
            <div key={chest.id} className="flex items-center gap-3 rounded-xl border bg-surface p-3">
              <span className="text-2xl" aria-hidden>{CHEST_EMOJI[chest.id]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">{chest.label}</div>
                <div className="text-xs text-secondary">
                  {chest.waitHours} tim · {chest.diamondMin}–{chest.diamondMax} <DiamondIcon /> och chans på kort
                </div>
              </div>
              <Button
                disabled={!enabled || busyId !== null}
                onClick={() => void handleBuyChest(chest.id, chest.label)}
                variant={enabled ? "default" : "outline"}
                className={`h-10 shrink-0 ${enabled ? "bg-accent text-accent-on hover:bg-accent/90" : ""}`}
              >
                {busyId === `chest:${chest.id}`
                  ? "Köper..."
                  : !hasRoom
                    ? "Ingen plats"
                    : <>{chest.price} <DiamondIcon /></>}
              </Button>
            </div>
          );
        })}
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-secondary">Köp kistplats</h3>
        <p className="text-xs text-secondary">
          Din fria plats tar vilken kista som helst. En fast plats rymmer bara sin egen sorts kista.
          Platser: {data.slots} av {data.maxSlots}.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {data.slotTypes.map((slot) => (
            <SlotPurchase
              key={slot.type}
              slot={slot}
              canAfford={diamonds >= slot.price}
              isBusy={busyId === `slot:${slot.type}`}
              disabled={busyId !== null}
              onBuy={() => void handleBuySlot(slot.type)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

/** One dedicated-slot offer: bought once, permanent, its own Chest type only. */
function SlotPurchase({ slot, canAfford, isBusy, disabled, onBuy }: {
  slot: ChestSlotOption;
  canAfford: boolean;
  isBusy: boolean;
  disabled: boolean;
  onBuy: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-surface p-3">
      <div className="flex items-center gap-2">
        <span className="text-xl" aria-hidden>{CHEST_EMOJI[slot.type] ?? "🎁"}</span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{capitalize(slot.slotLabel)}</div>
          <div className="text-[11px] text-secondary">{slot.price.toLocaleString("sv-SE")} <DiamondIcon /></div>
        </div>
      </div>
      {slot.owned ? (
        <div className="mt-auto text-xs font-medium text-success">✓ Köpt</div>
      ) : (
        <Button
          size="sm"
          disabled={disabled || !canAfford}
          onClick={onBuy}
          variant={canAfford ? "default" : "outline"}
          className={`mt-auto ${canAfford ? "bg-diamonds text-accent-on hover:bg-diamonds" : ""}`}
        >
          {isBusy ? "Köper..." : canAfford ? "Köp plats" : "För få"}
        </Button>
      )}
    </div>
  );
}
