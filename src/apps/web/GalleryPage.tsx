import { useEffect, useMemo, useState } from "react";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity } from "../../data/cards";
import type { CardPoolInfo } from "../../types/game";
import { fetchCardPool } from "../../utils/gameApi";

type RarityFilter = "all" | CardRarity;
type SortMode = "ranking" | "name";

export function GalleryPage() {
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("ranking");
  const [poolInfo, setPoolInfo] = useState<CardPoolInfo>({});

  useEffect(() => {
    fetchCardPool().then(setPoolInfo).catch(() => {});
  }, []);

  const visibleCards = useMemo(() => {
    const filtered =
      rarityFilter === "all" ? cards : cards.filter((c) => c.rarity === rarityFilter);

    return [...filtered].sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name, "sv");

      const aRank = a.rankingPosition ?? Number.POSITIVE_INFINITY;
      const bRank = b.rankingPosition ?? Number.POSITIVE_INFINITY;
      if (aRank !== bRank) return aRank - bRank;

      const rarityDiff = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (rarityDiff !== 0) return rarityDiff;
      return a.name.localeCompare(b.name, "sv");
    });
  }, [rarityFilter, sortMode]);

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3">Galleri</h1>
              <p className="text-gray-600">
                Alla kort i spelet. Varje kort finns i ett begränsat antal kopior globalt.
              </p>
            </div>

            <div className="w-full md:w-80 space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-2">Sortera</label>
                <select
                  value={sortMode}
                  onChange={(e) => setSortMode(e.target.value as SortMode)}
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                >
                  <option value="ranking">Ranking</option>
                  <option value="name">Namn</option>
                </select>
              </div>

              <div>
                <label className="block text-sm text-gray-600 mb-2">Visa rarity</label>
                <select
                  value={rarityFilter}
                  onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                >
                  <option value="all">Alla</option>
                  <option value="legendary">Legendary</option>
                  <option value="epic">Epic</option>
                  <option value="rare">Rare</option>
                  <option value="common">Common</option>
                </select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {visibleCards.map((card) => {
              const pool = poolInfo[card.id];
              const remaining = pool?.copiesRemaining ?? null;
              const total = pool?.totalCopies ?? null;
              const soldOut = remaining === 0;

              return (
                <div key={card.id} className={`space-y-1 ${soldOut ? "opacity-50" : ""}`}>
                  <CardPlaceholder
                    rarity={card.rarity}
                    size="small"
                    name={card.name}
                    designKey={card.designKey}
                    showCaption
                  />
                  {remaining !== null && (
                    <div className="text-center">
                      {soldOut ? (
                        <span className="text-[10px] font-medium uppercase tracking-wide text-red-500">
                          Slutsåld
                        </span>
                      ) : (
                        <span className="text-[10px] text-gray-400">
                          {remaining} / {total} kvar
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
