import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AchievementsSection } from "../../components/web/AchievementsSection";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity } from "../../data/cards";
import { collections } from "../../data/packs";
import { fetchGameState, fetchMyCardsForTrade } from "../../utils/gameApi";

type RarityFilter = "all" | CardRarity;
type CollectionFilter = "all" | string;

// A couple may represent more than one club, written "UBSS / MÄLAR". Split on
// "/" so the card shows up when filtering by either club individually.
function splitClubs(club?: string): string[] {
  return (club ?? "").split("/").map((s) => s.trim()).filter(Boolean);
}

type CollectionPageProps = {
  userEmail: string | null;
};

export function CollectionPage({ userEmail }: CollectionPageProps) {
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>("all");
  const [danceStyleFilter, setDanceStyleFilter] = useState<string>("all");
  const [clubFilter, setClubFilter] = useState<string>("all");
  const [ownedCardIds, setOwnedCardIds] = useState<string[]>([]);
  const [forTradeIds, setForTradeIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userEmail) { setOwnedCardIds([]); setForTradeIds(new Set()); return; }

    setIsLoading(true);
    setError(null);

    Promise.all([fetchGameState(), fetchMyCardsForTrade()])
      .then(([state, forTrade]) => {
        setOwnedCardIds(state.ownedCardIds);
        setForTradeIds(new Set(forTrade.map((c) => c.cardId)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda samlingen."))
      .finally(() => setIsLoading(false));
  }, [userEmail]);

  const ownedCounts = useMemo(
    () =>
      ownedCardIds.reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {}),
    [ownedCardIds],
  );

  // Distinct dance styles / clubs across owned cards — drives the filter dropdowns.
  const ownedCards = useMemo(
    () => cards.filter((card) => (ownedCounts[card.id] ?? 0) > 0),
    [ownedCounts],
  );

  const danceStyleOptions = useMemo(
    () => Array.from(new Set(ownedCards.map((c) => c.danceStyle).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "sv")),
    [ownedCards],
  );

  const clubOptions = useMemo(
    () => Array.from(new Set(ownedCards.flatMap((c) => splitClubs(c.club)))).sort((a, b) => a.localeCompare(b, "sv")),
    [ownedCards],
  );

  const visibleCards = useMemo(() => {
    let candidateCards = ownedCards;
    if (rarityFilter !== "all") candidateCards = candidateCards.filter((c) => c.rarity === rarityFilter);
    if (collectionFilter !== "all") candidateCards = candidateCards.filter((c) => c.collectionId === collectionFilter);
    if (danceStyleFilter !== "all") candidateCards = candidateCards.filter((c) => c.danceStyle === danceStyleFilter);
    if (clubFilter !== "all") candidateCards = candidateCards.filter((c) => splitClubs(c.club).includes(clubFilter));
    return [...candidateCards].sort((a, b) => {
      const d = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      return d !== 0 ? d : a.name.localeCompare(b.name, "sv");
    });
  }, [ownedCards, rarityFilter, collectionFilter, danceStyleFilter, clubFilter]);

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

  const forTradeCount = useMemo(
    () => cards.filter((c) => (ownedCounts[c.id] ?? 0) > 0 && forTradeIds.has(c.id)).length,
    [ownedCounts, forTradeIds],
  );

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
            <div>
              <h1 className="text-4xl md:text-5xl font-bold mb-3">Samling</h1>
              <p className="text-gray-600 mb-3">
                Dina kort. Kort märkta med <span className="text-purple-600 font-medium">⇄</span> är tillgängliga för byte.
              </p>
              <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                <Link to="/samling/byte">⇄ Markera kort för byte</Link>
              </Button>
              {forTradeCount > 0 && (
                <p className="text-xs text-purple-600 mt-2">
                  {forTradeCount} {forTradeCount === 1 ? "kort markerat" : "kort markerade"} för byte just nu
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
                  <option value="special">Special</option>
                  <option value="legendary">Legendary</option>
                  <option value="epic">Epic</option>
                  <option value="rare">Rare</option>
                  <option value="common">Common</option>
                </select>
              </div>
              {collections.length > 1 && (
                <div>
                  <label htmlFor="collection-filter" className="block text-sm text-gray-600 mb-2">Visa kortpaket</label>
                  <select
                    id="collection-filter"
                    value={collectionFilter}
                    onChange={(e) => setCollectionFilter(e.target.value)}
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  >
                    <option value="all">Alla paket</option>
                    {collections.map((c) => (
                      <option key={c.id} value={c.id}>{c.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {danceStyleOptions.length > 1 && (
                <div>
                  <label htmlFor="dancestyle-filter" className="block text-sm text-gray-600 mb-2">Visa dansstil</label>
                  <select
                    id="dancestyle-filter"
                    value={danceStyleFilter}
                    onChange={(e) => setDanceStyleFilter(e.target.value)}
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  >
                    <option value="all">Alla dansstilar</option>
                    {danceStyleOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              )}
              {clubOptions.length > 1 && (
                <div>
                  <label htmlFor="club-filter" className="block text-sm text-gray-600 mb-2">Visa förening</label>
                  <select
                    id="club-filter"
                    value={clubFilter}
                    onChange={(e) => setClubFilter(e.target.value)}
                    className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  >
                    <option value="all">Alla föreningar</option>
                    {clubOptions.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <AchievementsSection />

          {visibleCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
              {isLoading ? "Laddar samling..." : "Du har inga kort i den här kategorin ännu."}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {visibleCards.map((card) => {
                const count = ownedCounts[card.id] ?? 0;
                const isForTrade = forTradeIds.has(card.id);

                return (
                  <div key={card.id} className="flex flex-col items-center gap-1">
                    <div className="relative">
                      <CardPlaceholder
                        rarity={card.rarity}
                        size="small"
                        name={card.name}
                        danceStyle={card.danceStyle}
                        designKey={card.designKey}
                        showCaption
                      />
                      {count > 1 && (
                        <div className="absolute top-1.5 right-1.5 z-10 bg-black/70 text-white text-[10px] font-bold rounded px-1.5 py-0.5 leading-none pointer-events-none">
                          ×{count}
                        </div>
                      )}
                      {isForTrade && (
                        <div className="absolute top-1.5 left-1.5 z-10 bg-purple-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5 leading-none pointer-events-none">
                          ⇄
                        </div>
                      )}
                    </div>
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
