import { useMemo } from "react";
import { cards } from "../../data/cards";
import { CardPlaceholder } from "./CardPlaceholder";

function seededSlice<T>(arr: T[], count: number, seed: number): T[] {
  const shuffled = [...arr].sort((a, b) => {
    const ha = ((arr.indexOf(a) + seed) * 2654435761) >>> 0;
    const hb = ((arr.indexOf(b) + seed) * 2654435761) >>> 0;
    return ha - hb;
  });
  return shuffled.slice(0, count);
}

export function CardCarousel() {
  const row1 = useMemo(() => {
    const picks = seededSlice(
      cards.filter((c) => c.rarity === "legendary" || c.rarity === "epic" || c.rarity === "special"),
      14,
      1,
    );
    return [...picks, ...picks];
  }, []);

  const row2 = useMemo(() => {
    const picks = seededSlice(
      cards.filter((c) => c.rarity === "rare" || c.rarity === "common"),
      16,
      2,
    );
    return [...picks, ...picks];
  }, []);

  return (
    <section className="bg-gray-950 py-12 overflow-hidden select-none">
      <div className="space-y-3">
        <div className="flex gap-3 carousel-scroll-left" style={{ width: "max-content" }}>
          {row1.map((card, i) => (
            <div key={`r1-${card.id}-${i}`} className="flex-shrink-0">
              <CardPlaceholder
                rarity={card.rarity}
                size="small"
                name={card.name}
                designKey={card.designKey}
                showCaption={false}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-3 carousel-scroll-right" style={{ width: "max-content" }}>
          {row2.map((card, i) => (
            <div key={`r2-${card.id}-${i}`} className="flex-shrink-0">
              <CardPlaceholder
                rarity={card.rarity}
                size="small"
                name={card.name}
                designKey={card.designKey}
                showCaption={false}
              />
            </div>
          ))}
        </div>
      </div>

      <p className="text-center text-gray-600 text-xs mt-6 tracking-widest uppercase">
        Håll muspekaren för att pausa · Klicka på ett kort för att förstora
      </p>
    </section>
  );
}
