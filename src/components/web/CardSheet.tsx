import { useEffect, useId } from "react";
import { createPortal } from "react-dom";
import { ImageWithFallback } from "../shared/figma/ImageWithFallback";
import { resolveCardDesignUrl } from "../../data/cardDesignUrls";
import { rarityColor, rarityLabel, rarityPip } from "../../data/rarity";
import type { DanceCard } from "../../types/danceCard";
import { initialsOf } from "./CardThumb";

type CardSheetProps = {
  card: DanceCard;
  /** Copies of this Card the viewer owns. */
  copies: number;
  /** Whether the Card is set to Behåll (kept out of Trades). */
  kept?: boolean;
  /** Called with the new Behåll value. The toggle only shows when the viewer owns Duplicates. */
  onToggleKept?: (keep: boolean) => void;
  onClose: () => void;
};

/** Bottom sheet with a large image, the Rarity and Copies owned. Pure presentation. */
export function CardSheet({ card, copies, kept = false, onToggleKept, onClose }: CardSheetProps) {
  const titleId = useId();
  const color = rarityColor(card.rarity);
  const owned = copies > 0;
  const art = owned ? resolveCardDesignUrl(card.designKey) : undefined;
  const subtitle = [card.event, card.danceStyle, card.club].filter(Boolean).join(" · ");

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
        <div
          className={`relative mx-auto aspect-[4/5] w-full max-w-[260px] overflow-hidden bg-raised ${owned && card.rarity === "special" ? "card-holo" : ""}`}
          style={{ border: `2px solid ${owned ? color : "var(--color-hairline-strong)"}`, borderStyle: owned ? "solid" : "dashed", borderRadius: 10 }}
        >
          {art ? (
            <ImageWithFallback src={art} alt={card.name} className="absolute inset-0 h-full w-full object-cover object-top" />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={owned ? { backgroundImage: `repeating-linear-gradient(45deg, color-mix(in srgb, ${color} 28%, transparent) 0 2px, transparent 2px 6px), repeating-linear-gradient(-45deg, color-mix(in srgb, ${color} 28%, transparent) 0 2px, transparent 2px 6px)` } : undefined}
            >
              <span className="font-display text-6xl font-bold text-text" aria-hidden>{owned ? initialsOf(card.name) : "?"}</span>
            </div>
          )}
        </div>
        <h2 id={titleId} className="mt-4 text-center text-xl font-semibold">{card.name}</h2>
        {subtitle && <p className="mt-0.5 text-center text-sm text-secondary">{subtitle}</p>}
        <div className="mt-3 flex items-center justify-center gap-4 text-sm">
          <span className="font-semibold" style={{ color }}>{rarityPip[card.rarity]} {rarityLabel[card.rarity]}</span>
          <span className="text-text">{copies === 0 ? "Du äger inget ex" : `Du äger ${copies} ex`}</span>
        </div>
        {copies > 1 && onToggleKept && (
          <label className="mt-4 flex items-center justify-center gap-2 text-sm text-text">
            <input type="checkbox" checked={kept} onChange={(e) => onToggleKept(e.target.checked)} className="h-4 w-4" />
            Behåll (erbjuds inte till byte)
          </label>
        )}
      </div>
    </div>,
    document.body,
  );
}
