import { useEffect, useMemo, useState } from "react";
import { cards } from "../../data/cards";
import type { CardPoolInfo } from "../../types/game";
import { fetchCardPool } from "../../utils/gameApi";

const RARITIES = [
  { key: "special",   label: "Special",   color: "text-fuchsia-400", zero: "text-red-400" },
  { key: "legendary", label: "Legendary", color: "text-amber-400",  zero: "text-red-400" },
  { key: "epic",      label: "Epic",      color: "text-purple-400", zero: "text-red-400" },
  { key: "rare",      label: "Rare",      color: "text-blue-400",   zero: "text-red-400" },
  { key: "common",    label: "Common",    color: "text-gray-400",   zero: "text-red-400" },
] as const;

type CardPoolRemainingProps = {
  collectionId: string;
};

/**
 * "Kort kvar i poolen" — remaining copies per rarity for one collection.
 * Shared by the logged-in landing page and the Handel pool button so the two
 * can never drift apart. Styled for a dark background in both places.
 *
 * Fetches on mount rather than caching: buying a pack changes these numbers, so
 * re-reading each time the list appears is the point, not waste.
 */
export function CardPoolRemaining({ collectionId }: CardPoolRemainingProps) {
  const [poolInfo, setPoolInfo] = useState<CardPoolInfo>({});

  useEffect(() => {
    let cancelled = false;
    fetchCardPool()
      .then((pool) => { if (!cancelled) setPoolInfo(pool); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const remaining = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of cards) {
      if (card.collectionId !== collectionId) continue;
      const entry = poolInfo[card.id];
      if (entry === undefined) continue;
      counts[card.rarity] = (counts[card.rarity] ?? 0) + entry.copiesRemaining;
    }
    return counts;
  }, [poolInfo, collectionId]);

  const poolLoaded = Object.keys(poolInfo).length > 0;

  return (
    <div className="space-y-3">
      <div className="text-xs text-gray-500 uppercase tracking-wider">Kort kvar i poolen</div>
      {RARITIES.map(({ key, label, color, zero }) => {
        const count = remaining[key];
        const soldOut = poolLoaded && count === 0;
        return (
          <div key={key} className="flex items-center justify-between">
            <span className={`text-sm font-medium ${color}`}>{label}</span>
            <span className={`text-sm font-semibold ${soldOut ? zero : "text-white"}`}>
              {!poolLoaded ? "–" : soldOut ? "Slutsåld" : `${count} kvar`}
            </span>
          </div>
        );
      })}
    </div>
  );
}
