import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import type { GameEvent } from "../../types/game";
import { DiamondIcon } from "./DiamondIcon";

const CHEST_NAME: Record<string, string> = { bronze: "Bronskista", silver: "Silverkista", gold: "Guldkista" };

/** "1 d 4 h", "3 h 12 min" or "4 min 05 s", whichever reads best for the time left. */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (d > 0) return `${d} d ${h} h`;
  if (h > 0) return `${h} h ${m} min`;
  return `${m} min ${String(s).padStart(2, "0")} s`;
}

/** The active rewards of an Event, one line each. */
export function eventRewards(event: GameEvent): string[] {
  const rewards: string[] = [];
  if (event.dailyDiamonds != null) rewards.push(`${event.dailyDiamonds} diamanter i dagliga hämtningen`);
  for (const [type, hours] of Object.entries(event.chestWaitHours ?? {})) {
    rewards.push(`${CHEST_NAME[type] ?? type}: ${hours} h väntetid`);
  }
  return rewards;
}

type EventSheetProps = { event: GameEvent; now: number; onClose: () => void };

/** Bottom sheet for the running Event: name, countdown and active rewards. There is no Event page. */
export function EventSheet({ event, now, onClose }: EventSheetProps) {
  const titleId = useId();
  const rewards = eventRewards(event);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Stäng" />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border bg-surface p-5 pb-8 sm:rounded-2xl">
        <button type="button" onClick={onClose} aria-label="Stäng" className="absolute right-2 top-2 rounded-lg px-3 text-2xl leading-none text-secondary hover:text-text">×</button>
        <h2 id={titleId} className="font-display text-2xl font-bold">{event.label}</h2>
        <p className="mt-1 text-sm text-secondary">
          Slutar om <span className="font-semibold tabular-nums text-text">{formatCountdown(Date.parse(event.endsAt) - now)}</span>
        </p>
        {rewards.length > 0 && (
          <ul className="mt-4 space-y-2">
            {rewards.map((r) => (
              <li key={r} className="flex items-center gap-2 rounded-lg bg-raised px-3 py-2 text-sm">
                <span className="text-diamonds" aria-hidden><DiamondIcon /></span>{r}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>,
    document.body,
  );
}
