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
  common: "text-gray-400",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-amber-400",
};

const rarityGlow: Record<string, string> = {
  common: "none",
  rare: "drop-shadow(0 0 8px rgba(96,165,250,0.65))",
  epic: "drop-shadow(0 0 12px rgba(168,85,247,0.75))",
  legendary: "drop-shadow(0 0 16px rgba(251,191,36,0.9))",
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

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex flex-col items-center gap-8 max-w-3xl w-full">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">{packLabel} öppnat!</h2>
          <p className="text-white/40 mt-1 text-sm">
            {allRevealed
              ? `${cards.length} kort`
              : revealedCount === 0
              ? "Tryck på korten för att vända dem"
              : `${revealedCount} / ${cards.length} vända`}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 sm:gap-5">
          {cards.map((card, i) => (
            <FlipCard
              key={`${card.id}-${i}`}
              card={card}
              revealed={revealed[i]}
              onFlip={() => flipCard(i)}
            />
          ))}
        </div>

        <div className="transition-all duration-300">
          {allRevealed ? (
            <Button
              size="lg"
              onClick={onClose}
              className="bg-white text-gray-900 hover:bg-gray-100 font-semibold px-10"
            >
              Stäng
            </Button>
          ) : (
            <Button
              size="lg"
              onClick={handleRevealAll}
              disabled={isAutoRevealing}
              variant="outline"
              className="border-white/30 text-white hover:bg-white/10 font-semibold px-10"
            >
              {isAutoRevealing ? "Vänder..." : "Vänd alla"}
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function FlipCard({
  card,
  revealed,
  onFlip,
}: {
  card: DanceCard;
  revealed: boolean;
  onFlip: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div style={{ perspective: "800px" }} className="w-32 h-44">
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
            className="rounded-xl bg-gradient-to-br from-gray-700 via-gray-800 to-gray-950 border-2 border-gray-600 flex items-center justify-center cursor-pointer group hover:border-gray-400 transition-colors"
          >
            <span className="text-4xl text-gray-500 select-none group-hover:scale-110 group-hover:text-gray-300 transition-transform duration-200">
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

      <div
        className={`text-center transition-opacity duration-300 delay-200 ${
          revealed ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className={`text-[10px] uppercase tracking-wider font-medium ${rarityLabel[card.rarity]}`}>
          {card.rarity}
        </div>
        <div className="text-xs text-white/75 line-clamp-2 leading-snug max-w-[7rem]">
          {card.name}
        </div>
      </div>
    </div>
  );
}
