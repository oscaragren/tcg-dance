import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cardById, rarityOrder, type DanceCard } from "../../data/cards";
import { dailyDiamonds, packConfigs, type PackType } from "../../data/packs";
import type { GameState } from "../../types/game";
import { buyPack, claimDailyDiamonds, fetchGameState } from "../../utils/gameApi";

type LoggedInHomePageProps = {
  username: string;
  userEmail: string;
};

export function LoggedInHomePage({ username, userEmail }: LoggedInHomePageProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadState() {
      try {
        const state = await fetchGameState();
        setGameState(state);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Kunde inte ladda speldata.");
      } finally {
        setIsLoadingState(false);
      }
    }
    void loadState();
  }, [userEmail]);

  async function handleClaimDailyDiamonds() {
    if (isClaiming) return;
    setIsClaiming(true);
    setError(null);
    try {
      const result = await claimDailyDiamonds();
      setGameState(result.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte hämta diamanter.");
    } finally {
      setIsClaiming(false);
    }
  }

  async function handleBuyPack(packId: string) {
    if (buyingPack) return;
    setBuyingPack(packId);
    setError(null);
    try {
      const result = await buyPack(packId);
      setGameState(result.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte köpa pack.");
    } finally {
      setBuyingPack(null);
    }
  }

  const sortedOpenedCards = useMemo((): DanceCard[] => {
    const cards = gameState?.lastOpenedCards ?? [];
    return [...cards].sort((a, b) => {
      const rarityDiff = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      if (rarityDiff !== 0) return rarityDiff;
      return a.name.localeCompare(b.name, "sv");
    });
  }, [gameState?.lastOpenedCards]);

  const diamonds = gameState?.diamonds ?? 0;
  const canClaim = gameState?.canClaimDailyDiamonds ?? false;

  return (
    <main className="min-h-[calc(100vh-72px)] bg-gradient-to-b from-gray-50 to-white py-16">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto space-y-10">

          {/* Welcome + diamond wallet */}
          <section className="rounded-2xl border bg-white p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-3">Välkommen, {username}!</h1>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-3xl font-bold text-blue-600">{isLoadingState ? "–" : diamonds}</span>
                  <span className="text-lg text-gray-500">diamanter</span>
                </div>
                <p className="text-sm text-gray-500 mt-1">
                  Du får {dailyDiamonds} diamanter gratis varje dag.
                </p>
              </div>
              <div className="flex flex-col gap-2 items-start md:items-end">
                <Button
                  size="lg"
                  onClick={handleClaimDailyDiamonds}
                  disabled={!canClaim || isLoadingState || isClaiming}
                  className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white"
                >
                  {isClaiming
                    ? "Hämtar..."
                    : canClaim
                    ? `Hämta ${dailyDiamonds} diamanter`
                    : "Diamanter hämtade idag"}
                </Button>
                {!isLoadingState && (
                  <p className="text-xs text-gray-500">
                    {canClaim ? "Dina dagliga diamanter väntar." : "Kom tillbaka imorgon för fler."}
                  </p>
                )}
              </div>
            </div>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          </section>

          {/* Pack shop */}
          <section className="rounded-2xl border bg-white p-8">
            <h2 className="text-2xl font-bold mb-2">Packbutik</h2>
            <p className="text-gray-600 mb-6">Köp pack med dina diamanter och utöka din samling.</p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {(Object.entries(packConfigs) as [PackType, (typeof packConfigs)[PackType]][]).map(
                ([packKey, config]) => {
                  const canAfford = diamonds >= config.price;
                  const isBuying = buyingPack === packKey;
                  return (
                    <div
                      key={packKey}
                      className="rounded-xl border bg-gray-50 p-6 flex flex-col gap-4"
                    >
                      <div>
                        <div className="text-xl font-bold">{config.label}</div>
                        <div className="text-sm text-gray-600 mt-1">{config.cardCount} kort per pack</div>
                      </div>

                      <div className="text-xs text-gray-500 space-y-0.5">
                        <div>Legendary: {(config.rarityChances.legendary * 100).toFixed(0)}%</div>
                        <div>Epic: {(config.rarityChances.epic * 100).toFixed(0)}%</div>
                        <div>Rare: {(config.rarityChances.rare * 100).toFixed(0)}%</div>
                        <div>Common: {(config.rarityChances.common * 100).toFixed(0)}%</div>
                      </div>

                      <div className="mt-auto flex flex-col gap-2">
                        <div className="text-lg font-semibold text-blue-600">{config.price} diamanter</div>
                        <Button
                          onClick={() => void handleBuyPack(packKey)}
                          disabled={!canAfford || isLoadingState || !!buyingPack}
                          variant={canAfford ? "default" : "outline"}
                          className={canAfford ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700" : ""}
                        >
                          {isBuying ? "Köper..." : canAfford ? "Köp" : "Inte tillräckligt"}
                        </Button>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          </section>

          {/* Last opened cards */}
          <section className="rounded-2xl border bg-white p-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold">Senast öppnade pack</h2>
              <Button asChild variant="outline">
                <Link to="/samling">Gå till samling</Link>
              </Button>
            </div>

            {sortedOpenedCards.length === 0 ? (
              <p className="text-gray-600">Köp ett pack för att se dina kort här.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {sortedOpenedCards.map((card, index) => {
                  const canonical = cardById(card.id) ?? card;
                  return (
                    <div key={`${card.id}-${index}`}>
                      <CardPlaceholder
                        rarity={canonical.rarity}
                        size="small"
                        name={canonical.name}
                        designKey={canonical.designKey}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </main>
  );
}
