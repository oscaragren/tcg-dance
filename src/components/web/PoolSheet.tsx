import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { rarityColor, rarityLabel, rarityPip } from "../../data/rarity";
import type { CardRarity } from "../../types/danceCard";

type PoolSheetProps = {
  packLabel: string;
  /** Copies left per Rarity, or null while loading. */
  copiesLeft: Partial<Record<CardRarity, number>> | null;
  onClose: () => void;
};

const ORDER: CardRarity[] = ["common", "rare", "epic", "legendary", "special"];

/** "Kvar i packet": how many Copies of each Rarity the Collection's Card pool still holds. */
export function PoolSheet({ packLabel, copiesLeft, onClose }: PoolSheetProps) {
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

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Stäng" />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border bg-surface p-5 pb-8 sm:rounded-2xl">
        <button type="button" onClick={onClose} aria-label="Stäng" className="absolute right-2 top-2 rounded-lg px-3 text-2xl leading-none text-secondary hover:text-text">×</button>
        <h2 id={titleId} className="font-display text-2xl font-bold">Kvar i {packLabel}</h2>
        <p className="mt-1 text-sm text-secondary">Så här många kort finns kvar att dra.</p>
        <ul className="mt-4 space-y-2">
          {ORDER.map((rarity) => {
            const n = copiesLeft?.[rarity] ?? 0;
            return (
              <li key={rarity} className={`flex items-center justify-between rounded-lg bg-raised px-3 py-2 text-sm ${copiesLeft && n === 0 ? "opacity-50" : ""}`}>
                <span className="flex items-center gap-2 font-semibold">
                  <span aria-hidden style={{ color: rarityColor(rarity) }}>{rarityPip[rarity]}</span>
                  {rarityLabel[rarity]}
                </span>
                <span className="tabular-nums">{copiesLeft ? `${n} kvar` : "…"}</span>
              </li>
            );
          })}
        </ul>
        <button type="button" onClick={onClose} className="mt-5 w-full rounded-lg bg-accent py-2 text-sm font-semibold text-accent-on">Stäng</button>
      </div>
    </div>,
    document.body,
  );
}
