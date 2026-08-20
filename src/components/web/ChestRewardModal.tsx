import { useEffect } from "react";
import { createPortal } from "react-dom";
import type { DanceCard } from "../../types/danceCard";
import { Button } from "../shared/ui/button";
import { CardPlaceholder } from "./CardPlaceholder";

interface ChestRewardModalProps {
  chestLabel: string;
  diamondsAwarded: number;
  cards: DanceCard[];
  onClose: () => void;
}

const rarityGlow: Record<string, string> = {
  common: "none",
  rare: "drop-shadow(0 0 10px rgba(96,165,250,0.7))",
  epic: "drop-shadow(0 0 14px rgba(168,85,247,0.8))",
  legendary: "drop-shadow(0 0 18px rgba(251,191,36,0.95))",
  special: "drop-shadow(0 0 20px rgba(217,70,239,1))",
};

export function ChestRewardModal({ chestLabel, diamondsAwarded, cards, onClose }: ChestRewardModalProps) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex max-h-full w-full max-w-2xl flex-col items-center gap-8 overflow-y-auto py-2">
        <div className="text-center">
          <div className="text-6xl mb-3" aria-hidden>🎁</div>
          <h2 className="text-3xl sm:text-4xl font-bold text-white">{chestLabel} öppnad!</h2>
        </div>

        <div className="flex items-center gap-2 rounded-full bg-white/10 px-6 py-3">
          <span className="text-3xl font-bold text-blue-300">+{diamondsAwarded}</span>
          <span className="text-2xl text-blue-300">◆</span>
        </div>

        {cards.length === 0 ? (
          <p className="text-sm text-white/50">Inga kort den här gången — bara diamanter.</p>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-white/60">
              {cards.length === 1 ? "Du fick också ett kort!" : `Du fick också ${cards.length} kort!`}
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              {cards.map((card, i) => (
                <div key={`${card.id}-${i}`} className="flex flex-col items-center gap-1.5">
                  <div style={{ filter: rarityGlow[card.rarity] }}>
                    <CardPlaceholder
                      rarity={card.rarity}
                      size="small"
                      name={card.name}
                      designKey={card.designKey}
                      showCaption={false}
                      disableLightbox
                    />
                  </div>
                  <div className="max-w-[8rem] text-center text-xs leading-snug text-white/75">{card.name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button
          size="lg"
          onClick={onClose}
          className="h-12 w-full max-w-xs rounded-full bg-white px-8 text-base font-bold text-gray-900 shadow-lg shadow-black/40 hover:bg-gray-100 sm:w-auto sm:min-w-[14rem]"
        >
          Stäng
        </Button>
      </div>
    </div>,
    document.body,
  );
}
