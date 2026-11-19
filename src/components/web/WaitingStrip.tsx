import type { WaitingItem } from "../../types/game";
import { DiamondIcon } from "./DiamondIcon";

type WaitingStripProps = {
  /** Tiles to show, in server order. The strip is hidden when empty. */
  items: WaitingItem[];
  /** Id of the item whose action is in flight. */
  busyId: string | null;
  onAct: (item: WaitingItem) => void;
  /** "strip" (phone): a swipe row. "grid" (desktop): a three-column grid. */
  layout?: "strip" | "grid";
};

const CHEST_GIFT: Record<string, string> = { bronze: "bronskista", silver: "silverkista", gold: "guldkista" };

function tileText(item: WaitingItem): { title: string; sub: string; action: string } {
  switch (item.type) {
    case "chest":
      return { title: `${item.chest.label} redo`, sub: "Öppna din kista", action: "Öppna" };
    case "achievement":
      return { title: item.achievement.title, sub: `+${item.achievement.reward} diamanter`, action: "Hämta" };
    case "weekly_goal":
      return { title: item.goal.title, sub: `Veckomål +${item.goal.reward}`, action: "Hämta" };
    case "event_gift":
      return {
        title: item.label,
        sub: item.gift.type === "diamonds" ? `Gåva +${item.gift.amount}` : `Gåva: ${CHEST_GIFT[item.gift.chestType] ?? "kista"}`,
        action: "Hämta",
      };
    case "daily":
      return { title: "Dagliga diamanter", sub: `+${item.diamonds}`, action: "Hämta" };
    case "starter_pack":
      return { title: "Gratis pack", sub: item.label, action: "Öppna" };
    case "comeback_gift":
      return { title: "Välkommen tillbaka!", sub: `Present +${item.diamonds}`, action: "Hämta" };
    case "starter_step":
      return { title: item.title, sub: `Kom igång +${item.reward}`, action: "Hämta" };
  }
}

/** Colour per tile kind: chest = amber, everything else neutral. Incoming Trades never appear here. */
function tileStyle(item: WaitingItem): { icon: string; tile: string; button: string } {
  switch (item.type) {
    case "chest":
      return { icon: "▣", tile: "border-[#f2b134] bg-[#f2b134]/10", button: "bg-[#f2b134] text-[#1f1513]" };
    default:
      return { icon: "", tile: "bg-surface", button: "bg-accent text-accent-on" };
  }
}

/** "Väntar på dig": a horizontal swipe strip of tiles, each with the action its home screen uses. */
export function WaitingStrip({ items, busyId, onAct, layout = "strip" }: WaitingStripProps) {
  if (items.length === 0) return null;
  const grid = layout === "grid";
  return (
    <section aria-label="Väntar på dig">
      <h2 className={`mb-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary ${grid ? "" : "px-4"}`}>Väntar på dig</h2>
      <ul className={grid ? "grid grid-cols-3 gap-3" : "flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1"}>
        {items.map((item) => {
          const { title, sub, action } = tileText(item);
          const style = tileStyle(item);
          return (
            <li key={`${item.type}-${item.id}`} className={`rounded-xl border p-2.5 ${style.tile} ${grid ? "" : "w-[150px] shrink-0 snap-start"}`}>
              <p className="truncate text-sm font-semibold">{style.icon && <span aria-hidden className="mr-1">{style.icon}</span>}{title}</p>
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-secondary">
                {sub}{(item.type === "achievement" || item.type === "weekly_goal" || item.type === "starter_step" || item.type === "comeback_gift" || (item.type === "event_gift" && item.gift.type === "diamonds")) && <span className="text-diamonds" aria-hidden><DiamondIcon /></span>}
              </p>
              <button
                type="button"
                onClick={() => onAct(item)}
                disabled={busyId === item.id}
                className={`mt-2 w-full rounded-lg py-1 text-xs font-semibold disabled:opacity-60 ${style.button}`}
              >
                {busyId === item.id ? "…" : action}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
