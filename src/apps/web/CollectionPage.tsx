import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AchievementsSection } from "../../components/web/AchievementsSection";
import { ChestsSection } from "../../components/web/ChestsSection";
import { SmCollectionDisclaimer } from "../../components/web/SmCollectionDisclaimer";
import { Badge } from "../../components/shared/ui/badge";
import { Button } from "../../components/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/shared/ui/tabs";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity, type DanceCard } from "../../data/cards";
import { collections } from "../../data/packs";
import { upcomingCollection } from "../../data/upcomingCollection";
import { fetchGameState, fetchMyCardsForTrade } from "../../utils/gameApi";

type RarityFilter = "all" | CardRarity;

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
  // Drives both the card grid and Prestationer below — "all" shows every
  // collection, a collection id scopes both to it, "tba" is the placeholder.
  const [activeCollectionId, setActiveCollectionId] = useState<string>("all");
  const [danceStyleFilter, setDanceStyleFilter] = useState<string>("all");
  const [clubFilter, setClubFilter] = useState<string>("all");
  const [showAll, setShowAll] = useState(false);
  const [ownedCardIds, setOwnedCardIds] = useState<string[]>([]);
  const [forTradeIds, setForTradeIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadCollection = useCallback(() => {
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

  useEffect(() => { loadCollection(); }, [loadCollection]);

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

  // In "Se alla" mode the dropdowns need to cover the whole catalog, not just
  // what the user happens to own.
  const filterableCards = showAll ? cards : ownedCards;

  const danceStyleOptions = useMemo(
    () => Array.from(new Set(filterableCards.map((c) => c.danceStyle).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, "sv")),
    [filterableCards],
  );

  const clubOptions = useMemo(
    () => Array.from(new Set(filterableCards.flatMap((c) => splitClubs(c.club)))).sort((a, b) => a.localeCompare(b, "sv")),
    [filterableCards],
  );

  // Not scoped by collection — cardsForCollection() below slices this
  // further per active tab.
  const visibleCards = useMemo(() => {
    let candidateCards = showAll ? cards : ownedCards;
    if (rarityFilter !== "all") candidateCards = candidateCards.filter((c) => c.rarity === rarityFilter);
    if (danceStyleFilter !== "all") candidateCards = candidateCards.filter((c) => c.danceStyle === danceStyleFilter);
    if (clubFilter !== "all") candidateCards = candidateCards.filter((c) => splitClubs(c.club).includes(clubFilter));
    return [...candidateCards].sort((a, b) => {
      const d = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      return d !== 0 ? d : a.name.localeCompare(b.name, "sv");
    });
  }, [ownedCards, showAll, rarityFilter, danceStyleFilter, clubFilter]);

  function cardsForCollection(collectionId: string) {
    return collectionId === "all" ? visibleCards : visibleCards.filter((c) => c.collectionId === collectionId);
  }

  function renderCardGrid(list: DanceCard[]) {
    if (list.length === 0) {
      return (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
          {isLoading
            ? "Laddar samling..."
            : showAll
              ? "Inga kort matchar filtren."
              : "Du har inga kort i den här kategorin ännu."}
        </div>
      );
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {list.map((card) => {
          const count = ownedCounts[card.id] ?? 0;
          const isForTrade = forTradeIds.has(card.id);
          // The design is a reward for owning the card, so unowned cards
          // in "Se alla" mode show only their text details.
          const isOwned = count > 0;

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
                  hideDesign={!isOwned}
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
    );
  }

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
          <div className="mb-10">
            <h1 className="text-4xl md:text-5xl font-bold mb-3">Samling</h1>
            <p className="text-gray-600 mb-3">
              Dina kort. Kort märkta med <span className="text-purple-600 font-medium">⇄</span> har du markerat att du vill byta bort.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-700 text-white">
                <Link to="/samling/byte">⇄ Välj kort du vill byta</Link>
              </Button>
              <Button
                size="sm"
                variant={showAll ? "default" : "outline"}
                onClick={() => setShowAll((v) => !v)}
                className={showAll ? "bg-gray-900 hover:bg-gray-800 text-white" : ""}
              >
                {showAll ? "Visa bara mina kort" : "Se alla kort"}
              </Button>
            </div>
            {showAll && (
              <p className="text-xs text-gray-500 mt-2">
                Kort du inte äger visas utan design — bara namn och dansstil.
              </p>
            )}
            {forTradeCount > 0 && (
              <p className="text-xs text-purple-600 mt-2">
                Du vill byta bort {forTradeCount} kort just nu
              </p>
            )}
          </div>

          <SmCollectionDisclaimer className="mb-6" />

          {/* Kistor takes 2/3 of the row, the filters take the remaining 1/3. */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <ChestsSection onCollected={loadCollection} />
            </div>

            {/* Hidden on mobile — too little room for three dropdowns there. */}
            <div className="hidden md:block space-y-3">
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

          <Tabs value={activeCollectionId} onValueChange={setActiveCollectionId} className="mt-3">
            <TabsList>
              {collections.map((c) => (
                <TabsTrigger key={c.id} value={c.id}>{c.label}</TabsTrigger>
              ))}
              <TabsTrigger value="tba" className="gap-1.5">
                {upcomingCollection.label}
                <Badge variant="secondary">Kommer snart</Badge>
              </TabsTrigger>
              <TabsTrigger value="all">Alla</TabsTrigger>
            </TabsList>

            <TabsContent value="all" className="mt-4">
              <AchievementsSection />
              {renderCardGrid(cardsForCollection("all"))}
              {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
            </TabsContent>

            {collections.map((c) => (
              <TabsContent key={c.id} value={c.id} className="mt-4">
                <AchievementsSection collectionId={c.id} />
                {renderCardGrid(cardsForCollection(c.id))}
                {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
              </TabsContent>
            ))}

            <TabsContent value="tba" className="mt-4">
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-12 text-center">
                <div className="text-4xl mb-3" aria-hidden>🔒</div>
                <h2 className="text-xl font-semibold mb-2">{upcomingCollection.tagline} är på väg</h2>
                <p className="text-gray-500 max-w-md mx-auto">{upcomingCollection.blurb}</p>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </main>
  );
}
