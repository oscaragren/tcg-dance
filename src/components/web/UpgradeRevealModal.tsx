import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { DanceCard } from "../../types/danceCard";
import { Button } from "../shared/ui/button";
import { CardPlaceholder } from "./CardPlaceholder";

interface UpgradeRevealModalProps {
  card: DanceCard;
  onClose: () => void;
}

const RARITY_LABEL: Record<string, string> = {
  common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", special: "Special",
};

const rarityTextColor: Record<string, string> = {
  common: "text-gray-300",
  rare: "text-blue-400",
  epic: "text-purple-400",
  legendary: "text-amber-400",
  special: "text-fuchsia-400",
};

const rarityGlow: Record<string, string> = {
  common: "none",
  rare: "drop-shadow(0 0 14px rgba(96,165,250,0.7))",
  epic: "drop-shadow(0 0 18px rgba(168,85,247,0.8))",
  legendary: "drop-shadow(0 0 24px rgba(251,191,36,0.95))",
  special: "drop-shadow(0 0 26px rgba(217,70,239,1))",
};

export function UpgradeRevealModal({ card, onClose }: UpgradeRevealModalProps) {
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    if (!revealed) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [revealed, onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85 backdrop-blur-md p-4 sm:p-8"
      role="dialog"
      aria-modal="true"
    >
      <div className="flex flex-col items-center gap-8">
        <div className="text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white">Uppgradering klar!</h2>
          <p className="text-white/40 mt-1 text-sm">
            {revealed ? "Här är ditt nya kort" : "Tryck på kortet för att vända det"}
          </p>
        </div>

        <div style={{ perspective: "1200px" }} className="w-64 h-80">
          <div
            style={{
              transformStyle: "preserve-3d",
              transition: "transform 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
              transform: revealed ? "rotateY(180deg)" : "rotateY(0deg)",
              width: "100%",
              height: "100%",
              position: "relative",
            }}
          >
            {/* Back face — tappable */}
            <div
              onClick={() => setRevealed(true)}
              style={{ backfaceVisibility: "hidden", position: "absolute", inset: 0 }}
              className="rounded-2xl bg-gradient-to-br from-gray-700 via-gray-800 to-gray-950 border-2 border-gray-600 flex items-center justify-center cursor-pointer group hover:border-purple-400 transition-colors"
            >
              <span className="text-6xl text-gray-500 select-none group-hover:scale-110 group-hover:text-purple-300 transition-transform duration-200">
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
                size="large"
                name={card.name}
                designKey={card.designKey}
                showCaption={false}
                disableLightbox
              />
            </div>
          </div>
        </div>

        <div
          className={`text-center transition-opacity duration-300 delay-200 ${revealed ? "opacity-100" : "opacity-0"}`}
        >
          <div className={`text-xs uppercase tracking-wider font-semibold ${rarityTextColor[card.rarity]}`}>
            {RARITY_LABEL[card.rarity]}
          </div>
          <div className="mt-1 text-lg font-semibold text-white">{card.name}</div>
        </div>

        <div className="transition-all duration-300">
          {revealed && (
            <Button
              size="lg"
              onClick={onClose}
              className="bg-white text-gray-900 hover:bg-gray-100 font-semibold px-10"
            >
              Stäng
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
