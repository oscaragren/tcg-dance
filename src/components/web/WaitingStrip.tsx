import { Link } from "react-router-dom";
import type { WaitingItem } from "../../types/game";
import { DiamondIcon } from "./DiamondIcon";

type WaitingStripProps = {
  /** Tiles to show, in server order. The strip is hidden when empty. */
  items: WaitingItem[];
  /** Id of the item whose action is in flight. */
  busyId: string | null;
  onAct: (item: WaitingItem) => void;
};

const CHEST_GIFT: Record<string, string> = { bronze: "bronskista", silver: "silverkista", gold: "guldkista" };

function tileText(item: WaitingItem): { title: string; sub: string; action: string; to?: string } {
  switch (item.type) {
    case "trade": {
      const t = item.trade;
      const gives = t.offeredCardIds.length + (t.offeredDiamonds > 0 ? 1 : 0);
      return { title: `Byte från ${t.sender.username}`, sub: `Erbjuder ${gives} sak${gives === 1 ? "" : "er"}`, action: "Acceptera", to: "/byte" };
    }
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
  }
}

/** "Väntar på dig": a horizontal swipe strip of tiles, each with the action its home screen uses. */
export function WaitingStrip({ items, busyId, onAct }: WaitingStripProps) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Väntar på dig">
      <h2 className="mb-1.5 px-4 text-xs font-semibold uppercase tracking-wider text-tertiary">Väntar på dig</h2>
      <ul className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-4 pb-1">
        {items.map((item) => {
          const { title, sub, action, to } = tileText(item);
          return (
            <li key={`${item.type}-${item.id}`} className="w-[150px] shrink-0 snap-start rounded-xl border bg-surface p-2.5">
              {to ? (
                <Link to={to} className="block truncate text-sm font-semibold hover:underline">{title}</Link>
              ) : (
                <p className="truncate text-sm font-semibold">{title}</p>
              )}
              <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-secondary">
                {sub}{(item.type === "achievement" || item.type === "weekly_goal" || (item.type === "event_gift" && item.gift.type === "diamonds")) && <span className="text-diamonds" aria-hidden><DiamondIcon /></span>}
              </p>
              <button
                type="button"
                onClick={() => onAct(item)}
                disabled={busyId === item.id}
                className="mt-2 w-full rounded-lg bg-accent py-1 text-xs font-semibold text-accent-on disabled:opacity-60"
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
