import { useMemo, useState } from "react";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity } from "../../data/cards";

type RarityFilter = "all" | CardRarity;

export function GalleryPage() {
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");

  const visibleCards = useMemo(() => {
    const filteredCards =
      rarityFilter === "all" ? cards : cards.filter((card) => card.rarity === rarityFilter);

    return [...filteredCards].sort((a, b) => {
      const rarityDiff = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (rarityDiff !== 0) {
        return rarityDiff;
      }
      return a.name.localeCompare(b.name, "sv");
    });
  }, [rarityFilter]);

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3">Galleri</h1>
              <p className="text-gray-600">
                Här ser du alla tillgängliga kort. Filtrera på rarity för att visa en typ i taget.
              </p>
            </div>

            <div className="w-full md:w-72">
              <label className="block text-sm text-gray-600 mb-2">Visa rarity</label>
              <select
                value={rarityFilter}
                onChange={(event) => setRarityFilter(event.target.value as RarityFilter)}
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

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {visibleCards.map((card) => (
              <div key={card.id} className="space-y-2">
                <CardPlaceholder rarity={card.rarity} size="small" name={card.name} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
