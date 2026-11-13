import { ImageWithFallback } from "../shared/figma/ImageWithFallback";
import { resolveCardDesignUrl } from "../../data/cardDesignUrls";
import { rarityColor, rarityPip } from "../../data/rarity";
import type { DanceCard } from "../../types/danceCard";

/** Up to two initials from a couple's name ("Anna & Bo" -> "AB"). */
export function initialsOf(name: string): string {
  return name
    .split(/[\s&/,+-]+/)
    .filter((w) => /^\p{L}/u.test(w))
    .slice(0, 2)
    .map((w) => w[0].toUpperCase())
    .join("");
}

type CardThumbProps = {
  card: DanceCard;
  /** Copies owned. 0 renders a dashed silhouette with no Rarity colour. */
  copies: number;
  /** Makes the thumb a button. */
  onSelect?: (card: DanceCard) => void;
  /** Show the name under the thumb. */
  showName?: boolean;
  className?: string;
};

/**
 * One Card: 2px flat Rarity line, 10px radius, shape pip, Duplicate count.
 * Knows nothing about where it is shown. Width comes from its parent.
 */
export function CardThumb({ card, copies, onSelect, showName = true, className = "" }: CardThumbProps) {
  const owned = copies > 0;
  const art = owned ? resolveCardDesignUrl(card.designKey) : undefined;
  const color = rarityColor(card.rarity);

  const frame = owned ? (
    <div
      className={`relative aspect-[4/5] w-full overflow-hidden bg-raised ${card.rarity === "special" ? "card-holo" : ""}`}
      style={{ border: `2px solid ${color}`, borderRadius: 10 }}
    >
      {art ? (
        <ImageWithFallback src={art} alt="" aria-hidden className="absolute inset-0 h-full w-full object-cover object-top" />
      ) : (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            backgroundImage: `repeating-linear-gradient(45deg, color-mix(in srgb, ${color} 28%, transparent) 0 2px, transparent 2px 6px), repeating-linear-gradient(-45deg, color-mix(in srgb, ${color} 28%, transparent) 0 2px, transparent 2px 6px)`,
          }}
        >
          <span className="font-display font-bold text-text text-[length:clamp(14px,30cqw,36px)]" aria-hidden>
            {initialsOf(card.name)}
          </span>
        </div>
      )}
      <span className="card-pip absolute left-1 top-1 text-[10px] leading-none" style={{ color }} aria-hidden>
        {rarityPip[card.rarity]}
      </span>
      {copies > 1 && (
        <span className="absolute bottom-1 right-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold leading-none text-text">
          ×{copies}
        </span>
      )}
    </div>
  ) : (
    <div
      className="flex aspect-[4/5] w-full items-center justify-center text-tertiary"
      style={{ border: "2px dashed var(--color-hairline-strong)", borderRadius: 10 }}
    >
      <span className="text-xl opacity-40" aria-hidden>?</span>
    </div>
  );

  const label = `${card.name}, ${card.rarity}, ${owned ? `${copies} ex` : "saknas"}`;
  const body = (
    <>
      {frame}
      {showName && (
        <span className={`mt-1 block w-full truncate text-center text-[10px] leading-tight ${owned ? "text-text" : "text-tertiary"}`}>
          {card.name}
        </span>
      )}
    </>
  );

  return onSelect ? (
    <button
      type="button"
      onClick={() => onSelect(card)}
      aria-label={label}
      className={`card-thumb block w-full min-h-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-[10px] ${className}`}
    >
      {body}
    </button>
  ) : (
    <div className={`card-thumb ${className}`}>{body}</div>
  );
}
