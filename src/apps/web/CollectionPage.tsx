import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity } from "../../data/cards";
import { fetchGameState, fetchMyCardsForTrade, toggleCardForTrade } from "../../utils/gameApi";

type RarityFilter = "all" | CardRarity;

type CollectionPageProps = {
  userEmail: string | null;
};

export function CollectionPage({ userEmail }: CollectionPageProps) {
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [ownedCardIds, setOwnedCardIds] = useState<string[]>([]);
  const [forTradeIds, setForTradeIds] = useState<Set<string>>(new Set());
  const [showAllCards, setShowAllCards] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userEmail) { setOwnedCardIds([]); setForTradeIds(new Set()); return; }

    setIsLoading(true);
    setError(null);

    Promise.all([fetchGameState(), fetchMyCardsForTrade()])
      .then(([state, forTrade]) => {
        setOwnedCardIds(state.ownedCardIds);
        setForTradeIds(new Set(forTrade));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda samlingen."))
      .finally(() => setIsLoading(false));
  }, [userEmail]);

  async function handleToggleForTrade(cardId: string) {
    if (toggling) return;
    setToggling(cardId);
    // optimistic update
    setForTradeIds((prev) => {
      const next = new Set(prev);
      if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
      return next;
    });
    try {
      const result = await toggleCardForTrade(cardId);
      // sync with server truth
      setForTradeIds((prev) => {
        const next = new Set(prev);
        if (result.forTrade) next.add(cardId); else next.delete(cardId);
        return next;
      });
    } catch {
      // roll back
      setForTradeIds((prev) => {
        const next = new Set(prev);
        if (next.has(cardId)) next.delete(cardId); else next.add(cardId);
        return next;
      });
    } finally {
      setToggling(null);
    }
  }

  const ownedCounts = useMemo(
    () =>
      ownedCardIds.reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {}),
    [ownedCardIds],
  );

  const visibleCards = useMemo(() => {
    const candidateCards = showAllCards
      ? cards
      : cards.filter((card) => (ownedCounts[card.id] ?? 0) > 0);
    const filteredCards =
      rarityFilter === "all" ? candidateCards : candidateCards.filter((c) => c.rarity === rarityFilter);
    return [...filteredCards].sort((a, b) => {
      const d = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      return d !== 0 ? d : a.name.localeCompare(b.name, "sv");
    });
  }, [ownedCounts, rarityFilter, showAllCards]);

  if (!userEmail) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Din samling</h1>
            <p className="text-gray-600 mb-6">Logga in eller skapa ett konto för att se dina kort.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  const forTradeCount = visibleCards.filter((c) => forTradeIds.has(c.id)).length;

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3">Samling</h1>
              <p className="text-gray-600">
                Klicka på <span className="text-purple-600 font-medium">⇄</span> under ett kort för att markera det som tillgängligt för byte.
              </p>
              {forTradeCount > 0 && (
                <p className="text-sm text-purple-600 mt-1">
                  {forTradeCount} kort markerade för byte
                </p>
              )}
            </div>

            <div className="w-full md:w-80 space-y-3">
              <div>
                <label htmlFor="rarity-filter" className="block text-sm text-gray-600 mb-2">Visa rarity</label>
                <select
                  id="rarity-filter"
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

              <label
                htmlFor="show-all-cards"
                className="flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700"
              >
                <input
                  id="show-all-cards"
                  type="checkbox"
                  checked={showAllCards}
                  onChange={(e) => setShowAllCards(e.target.checked)}
                />
                Visa även kort jag inte äger
              </label>
            </div>
          </div>

          {visibleCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
              {isLoading ? "Laddar samling..." : "Du har inga kort i den här kategorin ännu."}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {visibleCards.map((card) => {
                const count = ownedCounts[card.id] ?? 0;
                const isOwned = count > 0;
                const isForTrade = forTradeIds.has(card.id);
                const isToggling = toggling === card.id;

                return (
                  <div
                    key={card.id}
                    className={`flex flex-col items-center gap-1 ${isOwned ? "" : "opacity-50 grayscale"}`}
                  >
                    <div className="relative">
                      <CardPlaceholder
                        rarity={card.rarity}
                        size="small"
                        name={card.name}
                        danceStyle={card.danceStyle}
                        designKey={card.designKey}
                      />
                      {count > 1 && (
                        <div className="absolute top-1.5 right-1.5 z-10 bg-black/70 text-white text-[10px] font-bold rounded px-1.5 py-0.5 leading-none pointer-events-none">
                          ×{count}
                        </div>
                      )}
                      {isForTrade && (
                        <div className="absolute bottom-1.5 left-1.5 z-10 bg-purple-600 text-white text-[9px] font-bold rounded px-1 py-0.5 leading-none pointer-events-none">
                          ⇄
                        </div>
                      )}
                    </div>

                    {isOwned && (
                      <button
                        onClick={() => void handleToggleForTrade(card.id)}
                        disabled={isToggling}
                        className={`w-full text-[10px] font-medium py-1 px-1 rounded transition-colors leading-none ${
                          isForTrade
                            ? "bg-purple-100 text-purple-700 hover:bg-purple-200"
                            : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600"
                        } ${isToggling ? "opacity-50" : ""}`}
                      >
                        {isForTrade ? "⇄ Till byte" : "⇄ Markera"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </main>
  );
}
