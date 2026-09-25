import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { Tabs, TabsList, TabsTrigger } from "../../components/shared/ui/tabs";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity } from "../../data/cards";
import { collections } from "../../data/packs";
import type { AuthUser } from "../../types/auth";
import type { PlayerProfile } from "../../types/game";
import { getPlayerProfile } from "../../utils/gameApi";

type RarityFilter = "all" | CardRarity;

type PlayerCollectionPageProps = { currentUser: AuthUser | null };

export function PlayerCollectionPage({ currentUser }: PlayerCollectionPageProps) {
  const { userId = "" } = useParams();
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [onlyForTrade, setOnlyForTrade] = useState(false);
  // Same tabs as Samling: one per collection plus "Alla".
  const [activeCollectionId, setActiveCollectionId] = useState<string>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser || !userId) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    getPlayerProfile(userId)
      .then(setProfile)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda spelarens samling."))
      .finally(() => setIsLoading(false));
  }, [currentUser, userId]);

  // Blank for accounts that predate mandatory names — the subheader is then
  // simply omitted rather than showing an empty line.
  const fullName = useMemo(
    () => [profile?.user.firstName, profile?.user.lastName].filter(Boolean).join(" "),
    [profile],
  );

  const ownedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const id of profile?.ownedCardIds ?? []) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, [profile]);

  const forTradeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const c of profile?.cardsForTrade ?? []) counts[c.cardId] = c.quantity;
    return counts;
  }, [profile]);

  const rarityTally = useMemo(() => {
    const tally: Record<string, number> = { legendary: 0, epic: 0, rare: 0, common: 0, special: 0 };
    for (const card of cards) {
      const n = ownedCounts[card.id] ?? 0;
      if (n > 0) tally[card.rarity] = (tally[card.rarity] ?? 0) + n;
    }
    return tally;
  }, [ownedCounts]);

  const visibleCards = useMemo(() => {
    let list = cards.filter((c) => (ownedCounts[c.id] ?? 0) > 0);
    if (activeCollectionId !== "all") list = list.filter((c) => c.collectionId === activeCollectionId);
    if (rarityFilter !== "all") list = list.filter((c) => c.rarity === rarityFilter);
    if (onlyForTrade) list = list.filter((c) => (forTradeCounts[c.id] ?? 0) > 0);
    return [...list].sort((a, b) => {
      const d = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (d !== 0) return d;
      const byName = a.name.localeCompare(b.name, "sv");
      // The same couple can appear once per year — keep those in year order.
      return byName !== 0 ? byName : (a.event ?? "").localeCompare(b.event ?? "", "sv");
    });
  }, [ownedCounts, forTradeCounts, rarityFilter, onlyForTrade, activeCollectionId]);

  // Unique cards owned per collection, shown on each tab.
  const uniqueOwnedByCollection = useMemo(() => {
    const result: Record<string, number> = {};
    for (const card of cards) {
      if ((ownedCounts[card.id] ?? 0) > 0 && card.collectionId) {
        result[card.collectionId] = (result[card.collectionId] ?? 0) + 1;
      }
    }
    return result;
  }, [ownedCounts]);

  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Spelarens samling</h1>
            <p className="text-gray-600 mb-6">Logga in för att se andra spelares samlingar.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  const forTradeTotal = Object.values(forTradeCounts).reduce((s, n) => s + n, 0);

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">

          <Link to="/topplista" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            ← Tillbaka till topplistan
          </Link>

          {isLoading ? (
            <p className="mt-8 text-gray-500">Laddar samling...</p>
          ) : error ? (
            <p className="mt-8 text-sm text-red-600">{error}</p>
          ) : !profile ? null : (
            <>
              <div className="mt-4 flex flex-col md:flex-row md:items-end md:justify-between gap-6 mb-10">
                <div>
                  <h1 className={"text-4xl md:text-5xl font-bold " + (fullName ? "mb-1" : "mb-3")}>
                    {profile.user.username}
                  </h1>
                  {fullName && (
                    <p className="text-lg text-gray-500 mb-3">{fullName}</p>
                  )}
                  <p className="text-gray-600">
                    {profile.ownedCardIds.length} kort ·{" "}
                    <span className="text-amber-700">{rarityTally.legendary} legendary</span> ·{" "}
                    <span className="text-purple-600">{rarityTally.epic} epic</span> ·{" "}
                    <span className="text-blue-600">{rarityTally.rare} rare</span> ·{" "}
                    <span className="text-gray-500">{rarityTally.common} common</span>
                  </p>
                  {!profile.isSelf && (
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <Button
                        asChild
                        size="sm"
                        className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white"
                      >
                        <Link to={`/byte/ny?anvandare=${profile.user.id}&namn=${encodeURIComponent(profile.user.username)}`}>
                          Föreslå ett byte
                        </Link>
                      </Button>
                      <span className="text-xs text-gray-500">
                        {forTradeTotal > 0
                          ? `${forTradeTotal} kort märkta "vill byta"`
                          : `Inga kort märkta "vill byta"`}
                      </span>
                    </div>
                  )}
                </div>

                <div className="w-full md:w-72 space-y-3">
                  <div>
                    <label htmlFor="player-rarity-filter" className="block text-sm text-gray-600 mb-2">Visa rarity</label>
                    <select
                      id="player-rarity-filter"
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
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    <input
                      type="checkbox"
                      checked={onlyForTrade}
                      onChange={(e) => setOnlyForTrade(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                    />
                    Visa bara kort märkta "vill byta"
                  </label>
                </div>
              </div>

              <Tabs value={activeCollectionId} onValueChange={setActiveCollectionId} className="mb-4">
                <TabsList>
                  {collections.map((c) => (
                    <TabsTrigger key={c.id} value={c.id} className="gap-1.5">
                      {c.label}
                      <span className="text-xs text-gray-400">{uniqueOwnedByCollection[c.id] ?? 0}</span>
                    </TabsTrigger>
                  ))}
                  <TabsTrigger value="all">Alla</TabsTrigger>
                </TabsList>
              </Tabs>

              {visibleCards.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-600">
                  Inga kort i den här kategorin.
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {visibleCards.map((card) => {
                    const count = ownedCounts[card.id] ?? 0;
                    const tradeQty = forTradeCounts[card.id] ?? 0;
                    return (
                      <div key={card.id} className="flex flex-col items-center gap-1">
                        <div className="relative">
                          <CardPlaceholder
                            rarity={card.rarity}
                            size="small"
                            name={card.name}
                            danceStyle={card.danceStyle}
                            event={card.event}
                            designKey={card.designKey}
                            showCaption
                          />
                          {count > 1 && (
                            <div className="absolute top-1.5 right-1.5 z-10 bg-black/70 text-white text-[10px] font-bold rounded px-1.5 py-0.5 leading-none pointer-events-none">
                              ×{count}
                            </div>
                          )}
                          {tradeQty > 0 && (
                            <div className="absolute top-1.5 left-1.5 z-10 bg-purple-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5 leading-none pointer-events-none">
                              ⇄ {tradeQty}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </main>
  );
}
