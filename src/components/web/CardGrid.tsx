import type { DanceCard } from "../../types/danceCard";
import { CardThumb } from "./CardThumb";

export type CardGridItem = { card: DanceCard; copies: number };

type CardGridProps = {
  items: CardGridItem[];
  onSelect?: (card: DanceCard) => void;
  /** Shown instead of the grid when there are no items. */
  empty?: React.ReactNode;
  /** Overrides the default grid column classes. */
  className?: string;
};

/** A responsive grid of Cards: 4 columns on a phone. Pure presentation. */
export function CardGrid({ items, onSelect, empty, className }: CardGridProps) {
  if (items.length === 0) return <>{empty ?? null}</>;
  return (
    <div className={className ?? "grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8"}>
      {items.map(({ card, copies }) => (
        <CardThumb key={card.id} card={card} copies={copies} onSelect={onSelect} />
      ))}
    </div>
  );
}
