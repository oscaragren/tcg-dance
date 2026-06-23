import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity } from "../../data/cards";
import type { AuthUser } from "../../types/auth";
import { fetchGameState, fetchMyCardsForTrade, toggleCardForTrade } from "../../utils/gameApi";

type RarityFilter = "all" | CardRarity;

type MarkForTradePageProps = {
  currentUser: AuthUser | null;
};

export function MarkForTradePage({ currentUser }: MarkForTradePageProps) {
  const navigate = useNavigate();
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [ownedCardIds, setOwnedCardIds] = useState<string[]>([]);
  const [forTradeIds, setForTradeIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) { setIsLoading(false); return; }

    setIsLoading(true);
    setError(null);

    Promise.all([fetchGameState(), fetchMyCardsForTrade()])
      .then(([state, forTrade]) => {
        setOwnedCardIds(state.ownedCardIds);
        setForTradeIds(new Set(forTrade));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda samlingen."))
      .finally(() => setIsLoading(false));
  }, [currentUser]);

  async function handleToggle(cardId: string) {
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

  const ownedCards = useMemo(() => {
    const owned = cards.filter((c) => (ownedCounts[c.id] ?? 0) > 0);
    const filtered = rarityFilter === "all" ? owned : owned.filter((c) => c.rarity === rarityFilter);
    return [...filtered].sort((a, b) => {
      const d = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      return d !== 0 ? d : a.name.localeCompare(b.name, "sv");
    });
  }, [ownedCounts, rarityFilter]);

  // Count only owned cards that are marked — avoids inflating the number with
  // stale IDs for cards the user no longer owns.
  const markedCount = useMemo(
    () => cards.filter((c) => (ownedCounts[c.id] ?? 0) > 0 && forTradeIds.has(c.id)).length,
    [ownedCounts, forTradeIds],
  );

  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl font-bold mb-4">Markera för byte</h1>
            <p className="text-gray-600 mb-6">Logga in för att hantera dina bytkort.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="py-12 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">

          {/* Back + header */}
          <div className="mb-8">
            <button
              onClick={() => navigate("/samling")}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
              Tillbaka till samlingen
            </button>

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2">Markera för byte</h1>
                <p className="text-gray-500 text-sm">
                  Tryck på ett kort för att markera eller avmarkera det som tillgängligt för byte.
                </p>
              </div>
              {markedCount > 0 && (
                <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 text-sm font-medium rounded-full px-4 py-1.5 shrink-0">
                  <span className="text-purple-500">⇄</span>
                  {markedCount} {markedCount === 1 ? "kort markerat" : "kort markerade"}
                </div>
              )}
            </div>
          </div>

          {/* Filter */}
          <div className="mb-6 flex items-center gap-3">
            <label className="text-sm text-gray-600 shrink-0">Visa rarity</label>
            <select
              value={rarityFilter}
              onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
              className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
            >
              <option value="all">Alla</option>
              <option value="special">Special</option>
              <option value="legendary">Legendary</option>
              <option value="epic">Epic</option>
              <option value="rare">Rare</option>
              <option value="common">Common</option>
            </select>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              Laddar samling...
            </div>
          ) : ownedCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              Du äger inga kort i den här kategorin.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {ownedCards.map((card) => {
                const count = ownedCounts[card.id] ?? 0;
                const isForTrade = forTradeIds.has(card.id);
                const isToggling = toggling === card.id;

                return (
                  <div
                    key={card.id}
                    onClick={() => { if (!isToggling) void handleToggle(card.id); }}
                    className={`relative flex flex-col items-center cursor-pointer select-none rounded-xl transition-all duration-150 ${
                      isToggling ? "opacity-50" : "hover:scale-[1.03]"
                    }`}
                  >
                    {/* Card thumbnail */}
                    <div className={`relative rounded-xl transition-all duration-150 ${
                      isForTrade ? "ring-2 ring-purple-500 ring-offset-2" : ""
                    }`}>
                      <CardPlaceholder
                        rarity={card.rarity}
                        size="small"
                        name={card.name}
                        danceStyle={card.danceStyle}
                        designKey={card.designKey}
                        showCaption
                      />

                      {/* Duplicate count */}
                      {count > 1 && (
                        <div className="absolute top-1.5 right-1.5 z-10 bg-black/70 text-white text-[10px] font-bold rounded px-1.5 py-0.5 leading-none pointer-events-none">
                          ×{count}
                        </div>
                      )}

                      {/* Click interceptor — prevents CardPlaceholder's lightbox from opening */}
                      <div className="absolute inset-0 z-20 rounded-xl" />

                      {/* Trade status badge */}
                      {isForTrade && (
                        <div className="absolute top-1.5 left-1.5 z-30 bg-purple-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5 leading-none pointer-events-none">
                          ⇄
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        </div>
      </div>
    </main>
  );
}
