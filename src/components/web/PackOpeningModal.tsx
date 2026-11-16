import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { DanceCard } from "../../types/danceCard";
import { Button } from "../shared/ui/button";
import { CardPlaceholder } from "./CardPlaceholder";

interface PackOpeningModalProps {
  packLabel: string;
  cards: DanceCard[];
  onClose: () => void;
}

const STAGGER_MS = 280;

const rarityLabel: Record<string, string> = {
  common: "text-tertiary",
  rare: "text-diamonds",
  epic: "text-text",
  legendary: "text-rarity-legendary",
  special: "text-rarity-epic",
};

const rarityGlow: Record<string, string> = {
  common: "none",
  rare: "drop-shadow(0 0 8px rgba(96,165,250,0.65))",
  epic: "drop-shadow(0 0 12px rgba(168,85,247,0.75))",
  legendary: "drop-shadow(0 0 16px rgba(251,191,36,0.9))",
  special: "drop-shadow(0 0 18px rgba(217,70,239,0.95))",
};

export function PackOpeningModal({ packLabel, cards, onClose }: PackOpeningModalProps) {
  const [revealed, setRevealed] = useState<boolean[]>(() => new Array(cards.length).fill(false));
  const [isAutoRevealing, setIsAutoRevealing] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const revealedCount = revealed.filter(Boolean).length;
  const allRevealed = revealedCount === cards.length;

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    return () => timers.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    if (!allRevealed) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [allRevealed, onClose]);

  function flipCard(index: number) {
    setRevealed((prev) => {
      if (prev[index]) return prev;
      const next = [...prev];
      next[index] = true;
      return next;
    });
  }

  function handleRevealAll() {
    if (isAutoRevealing) return;

    timers.current.forEach(clearTimeout);
    timers.current = [];
    setIsAutoRevealing(true);

    const unrevealedIndices = revealed
      .map((r, i) => (r ? null : i))
      .filter((i): i is number => i !== null);

    unrevealedIndices.forEach((cardIndex, pos) => {
      timers.current.push(
        setTimeout(() => {
          setRevealed((prev) => {
            const next = [...prev];
            next[cardIndex] = true;
            return next;
          });
        }, pos * STAGGER_MS),
      );
    });

    timers.current.push(
      setTimeout(
        () => setIsAutoRevealing(false),
        Math.max(0, unrevealedIndices.length - 1) * STAGGER_MS + 100,
      ),
    );
  }

  // Many cards (multi-Pack buys) are shown smaller on phones so more fit on screen.
  const compact = cards.length > 6;

  return createPortal(
    // Header and footer are pinned; only the card grid scrolls, so "Vänd alla kort" is always
    // reachable. 100dvh keeps the footer clear of mobile browser toolbars.
    <div
      className="fixed inset-x-0 top-0 z-50 flex h-[100dvh] flex-col items-center bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl shrink-0 px-4 pb-2 pt-4 text-center sm:px-8 sm:pt-8">
        <h2 className="text-2xl font-bold text-text sm:text-4xl">{packLabel} öppnat!</h2>
        <p className="mt-1 text-sm text-text/40">
          {allRevealed
            ? `${cards.length} kort`
            : revealedCount === 0
            ? "Tryck på korten för att vända dem"
            : `${revealedCount} / ${cards.length} vända`}
        </p>
      </div>

      <div className="min-h-0 w-full max-w-3xl flex-1 overflow-y-auto overscroll-contain px-4 py-3 sm:px-8">
        <div className="flex flex-wrap justify-center gap-3 sm:gap-5">
          {cards.map((card, i) => (
            <FlipCard
              key={`${card.id}-${i}`}
              card={card}
              revealed={revealed[i]}
              compact={compact}
              onFlip={() => flipCard(i)}
            />
          ))}
        </div>
      </div>

      <div className="flex w-full max-w-3xl shrink-0 justify-center border-t border-hairline bg-black/40 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-8">
        {allRevealed ? (
          <Button
            size="lg"
            onClick={onClose}
            className="h-12 w-full max-w-xs rounded-full bg-surface px-8 text-base font-bold text-text shadow-lg shadow-black/40 hover:bg-raised sm:w-auto sm:min-w-[14rem]"
          >
            Stäng
          </Button>
        ) : (
          <Button
            size="lg"
            onClick={handleRevealAll}
            disabled={isAutoRevealing}
            className="h-12 w-full max-w-xs rounded-full bg-surface px-8 text-base font-bold tracking-wide text-text shadow-lg shadow-black/40 ring-2 ring-background/70 hover:bg-raised disabled:opacity-70 sm:w-auto sm:min-w-[16rem]"
          >
            {isAutoRevealing ? "Vänder..." : "Vänd alla kort"}
          </Button>
        )}
      </div>
    </div>,
    document.body,
  );
}

function FlipCard({
  card,
  revealed,
  compact,
  onFlip,
}: {
  card: DanceCard;
  revealed: boolean;
  compact: boolean;
  onFlip: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        style={{ perspective: "800px" }}
        className={compact ? "h-[7.5rem] w-24 sm:h-40 sm:w-32" : "h-40 w-32"}
      >
        <div className={compact ? "h-40 w-32 origin-top-left scale-75 sm:scale-100" : "h-40 w-32"}>
        <div
          style={{
            transformStyle: "preserve-3d",
            transition: "transform 0.55s cubic-bezier(0.4, 0, 0.2, 1)",
            transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
            width: "100%",
            height: "100%",
            position: "relative",
          }}
        >
          {/* Back face — tappable */}
          <div
            onClick={onFlip}
            style={{ backfaceVisibility: "hidden", position: "absolute", inset: 0 }}
            className="rounded-xl bg-raised border-2 border-hairline-strong flex items-center justify-center cursor-pointer group hover:border-hairline-strong transition-colors"
          >
            <span className="text-4xl text-secondary select-none group-hover:scale-110 group-hover:text-tertiary transition-transform duration-200">
              ✦
            </span>
          </div>

          {/* Front face */}
          <div
            style={{
              backfaceVisibility: "hidden",
              transform: "rotateY(180deg)",
              position: "absolute",
              inset: 0,
              filter: revealed ? rarityGlow[card.rarity] : "none",
            }}
          >
            <CardPlaceholder
              rarity={card.rarity}
              size="small"
              name={card.name}
              designKey={card.designKey}
              showCaption={false}
            />
          </div>
        </div>
        </div>
      </div>

      <div
        className={`text-center transition-opacity duration-300 delay-200 ${
          revealed ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className={`text-[10px] uppercase tracking-wider font-medium ${rarityLabel[card.rarity]}`}>
          {card.rarity}
        </div>
        <div className="text-xs text-text/75 line-clamp-2 leading-snug max-w-[6rem] sm:max-w-[7rem]">
          {card.name}
        </div>
      </div>
    </div>
  );
}
