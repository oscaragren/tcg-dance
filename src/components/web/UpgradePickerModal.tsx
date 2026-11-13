import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { cards } from "../../data/cards";
import type { CardRarity } from "../../types/danceCard";
import { Button } from "../shared/ui/button";
import { CardPlaceholder } from "./CardPlaceholder";

interface UpgradePickerModalProps {
  collectionId: string;
  rarity: CardRarity;
  ownedCardIds: string[];
  requiredCount: number;
  isSubmitting: boolean;
  onConfirm: (cardIds: string[]) => void;
  onClose: () => void;
}

export function UpgradePickerModal({
  collectionId,
  rarity,
  ownedCardIds,
  requiredCount,
  isSubmitting,
  onConfirm,
  onClose,
}: UpgradePickerModalProps) {
  const [selected, setSelected] = useState<Record<string, number>>({});

  const ownedCounts = useMemo(
    () =>
      ownedCardIds.reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {}),
    [ownedCardIds],
  );

  const eligibleCards = useMemo(
    () =>
      cards
        .filter((c) => c.collectionId === collectionId && c.rarity === rarity && (ownedCounts[c.id] ?? 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "sv")),
    [collectionId, rarity, ownedCounts],
  );

  const selectedTotal = Object.values(selected).reduce((sum, n) => sum + n, 0);

  function adjust(cardId: string, delta: number) {
    setSelected((prev) => {
      const current = prev[cardId] ?? 0;
      const max = ownedCounts[cardId] ?? 0;
      const next = Math.max(0, Math.min(max, current + delta));
      if (delta > 0 && selectedTotal >= requiredCount) return prev;
      return { ...prev, [cardId]: next };
    });
  }

  function handleConfirm() {
    const cardIds: string[] = [];
    for (const [cardId, count] of Object.entries(selected)) {
      for (let i = 0; i < count; i++) cardIds.push(cardId);
    }
    onConfirm(cardIds);
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-6 border-b">
          <h2 className="text-xl font-bold">Välj kort att byta in</h2>
          <p className="text-sm text-gray-500 mt-1">
            Valda: <span className="font-semibold text-purple-600">{selectedTotal}</span> / {requiredCount}
          </p>
        </div>

        <div className="p-6 overflow-y-auto grid grid-cols-2 sm:grid-cols-3 gap-3 justify-items-center">
          {eligibleCards.map((card) => {
            const count = selected[card.id] ?? 0;
            const owned = ownedCounts[card.id] ?? 0;
            return (
              <div key={card.id} className="flex flex-col items-center gap-1.5">
                <div
                  onClick={() => adjust(card.id, 1)}
                  className={`relative cursor-pointer rounded-xl p-1 ${count > 0 ? "ring-2 ring-purple-500" : ""}`}
                >
                  <CardPlaceholder
                    rarity={card.rarity}
                    size="small"
                    name={card.name}
                    designKey={card.designKey}
                    showCaption={false}
                    disableLightbox
                  />
                  {count > 0 && (
                    <div className="absolute top-1.5 right-1.5 z-10 bg-purple-600 text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                      {count}
                    </div>
                  )}
                </div>
                <div className="text-[10px] text-gray-500">{count}/{owned}</div>
                {count > 0 && (
                  <button
                    onClick={() => adjust(card.id, -1)}
                    className="text-[10px] text-gray-400 hover:text-gray-700 underline"
                  >
                    Ta bort
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-6 border-t flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>Avbryt</Button>
          <Button
            disabled={selectedTotal !== requiredCount || isSubmitting}
            onClick={handleConfirm}
            className="bg-purple-600 hover:bg-purple-700 text-white"
          >
            {isSubmitting ? "Uppgraderar..." : "Uppgradera"}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
