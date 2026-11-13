import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import type { ComebackSummary } from "../../types/game";

type ComebackSheetProps = { summary: ComebackSummary; onClose: () => void };

/** "Välkommen tillbaka": what is new since the player's last Daily claim. Shown once per return. */
export function ComebackSheet({ summary, onClose }: ComebackSheetProps) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);

  const nothingNew = summary.collections.length === 0 && summary.events.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Stäng" />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border bg-surface p-5 pb-8 sm:rounded-2xl">
        <button type="button" onClick={onClose} aria-label="Stäng" className="absolute right-2 top-2 rounded-lg px-3 text-2xl leading-none text-secondary hover:text-text">×</button>
        <h2 id={titleId} className="font-display text-2xl font-bold">Välkommen tillbaka!</h2>
        <p className="mt-1 text-sm text-secondary">Det har gått {summary.awayDays} dagar sedan sist. Din present väntar under "Väntar på dig".</p>
        {nothingNew && <p className="mt-4 text-sm">Inget nytt sedan sist, men vi är glada att se dig.</p>}
        {summary.collections.length > 0 && (
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">Nya samlingar</h3>
            <ul className="mt-1.5 space-y-2">
              {summary.collections.map((c) => (
                <li key={c.id} className="flex items-center justify-between rounded-lg bg-raised px-3 py-2 text-sm">
                  <span className="font-semibold">{c.label}</span>
                  <span className="tabular-nums text-secondary">{c.owned} / {c.total}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        {summary.events.length > 0 && (
          <section className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-tertiary">Nya Events</h3>
            <ul className="mt-1.5 space-y-2">
              {summary.events.map((e) => (
                <li key={e.id} className="rounded-lg bg-raised px-3 py-2 text-sm font-semibold">{e.label}</li>
              ))}
            </ul>
          </section>
        )}
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-accent-on">Okej</button>
      </div>
    </div>,
    document.body,
  );
}
