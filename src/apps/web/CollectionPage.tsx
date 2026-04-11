import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity } from "../../data/cards";

type RarityFilter = "all" | CardRarity;

type CollectionPageProps = {
  userEmail: string | null;
};

function getStarterCardIds() {
  const priorityOrder: CardRarity[] = ["legendary", "epic", "rare", "common"];
  const starterCards = priorityOrder.flatMap((rarity) =>
    cards.filter((card) => card.rarity === rarity).slice(0, 2),
  );

  return starterCards.map((card) => card.id);
}

export function CollectionPage({ userEmail }: CollectionPageProps) {
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [ownedCardIds, setOwnedCardIds] = useState<string[]>([]);
  const [showAllCards, setShowAllCards] = useState(false);

  useEffect(() => {
    if (!userEmail) {
      setOwnedCardIds([]);
      return;
    }

    const storageKey = `tcg-owned-cards:${userEmail}`;
    const rawOwnedCards = localStorage.getItem(storageKey);

    if (rawOwnedCards) {
      try {
        setOwnedCardIds(JSON.parse(rawOwnedCards) as string[]);
        return;
      } catch {
        localStorage.removeItem(storageKey);
      }
    }

    const starterCardIds = getStarterCardIds();
    localStorage.setItem(storageKey, JSON.stringify(starterCardIds));
    setOwnedCardIds(starterCardIds);
  }, [userEmail]);

  const visibleCards = useMemo(() => {
    const ownedCardSet = new Set(ownedCardIds);
    const candidateCards = showAllCards ? cards : cards.filter((card) => ownedCardSet.has(card.id));
    const filteredCards =
      rarityFilter === "all" ? candidateCards : candidateCards.filter((card) => card.rarity === rarityFilter);

    return [...filteredCards].sort((a, b) => {
      const rarityDiff = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (rarityDiff !== 0) {
        return rarityDiff;
      }
      return a.name.localeCompare(b.name, "sv");
    });
  }, [ownedCardIds, rarityFilter, showAllCards]);

  if (!userEmail) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Din samling</h1>
            <p className="text-gray-600 mb-6">
              Logga in eller skapa ett konto för att se dina kort.
            </p>
            <Button asChild>
              <Link to="/auth?tab=login">Logga in</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3">Samling</h1>
              <p className="text-gray-600">
                Här ser du korten du äger. Filtrera på rarity för att visa en typ i taget.
              </p>
            </div>

            <div className="w-full md:w-80 space-y-3">
              <div>
                <label htmlFor="rarity-filter" className="block text-sm text-gray-600 mb-2">
                  Visa rarity
                </label>
                <select
                  id="rarity-filter"
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

              <label
                htmlFor="show-all-cards"
                className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <input
                  id="show-all-cards"
                  type="checkbox"
                  checked={showAllCards}
                  onChange={(event) => setShowAllCards(event.target.checked)}
                />
                Visa även kort jag inte äger
              </label>
            </div>
          </div>

          {visibleCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
              Du har inga kort i den här kategorin ännu.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
              {visibleCards.map((card) => {
                const isOwned = ownedCardIds.includes(card.id);

                return (
                  <div key={card.id} className={isOwned ? "" : "opacity-50 grayscale"}>
                    <CardPlaceholder
                      rarity={card.rarity}
                      size="small"
                      name={card.name}
                      designKey={card.designKey}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
