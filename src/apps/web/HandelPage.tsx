import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { PackOpeningModal } from "../../components/web/PackOpeningModal";
import { collections, dailyDiamonds } from "../../data/packs";
import type { AuthUser } from "../../types/auth";
import type { DanceCard } from "../../types/danceCard";
import type { GameState } from "../../types/game";
import { buyPack, claimDailyDiamonds, fetchGameState } from "../../utils/gameApi";

type HandelPageProps = { currentUser: AuthUser | null };

export function HandelPage({ currentUser }: HandelPageProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(!!currentUser);
  const [isClaiming, setIsClaiming] = useState(false);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedPack, setOpenedPack] = useState<{ label: string; cards: DanceCard[] } | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    fetchGameState()
      .then(setGameState)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda speldata."))
      .finally(() => setIsLoadingState(false));
  }, [currentUser]);

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

  async function handleBuyPack(collectionId: string, quantity: number) {
    if (buyingPack) return;
    setBuyingPack(collectionId);
    setError(null);
    try {
      const result = await buyPack(collectionId, quantity);
      setGameState(result.state);
      const col = collections.find((c) => c.id === collectionId);
      const label = col?.pack.label ?? "Pack";
      setOpenedPack({ label: quantity > 1 ? `${quantity} × ${label}` : label, cards: result.pulledCards });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte köpa pack.");
    } finally {
      setBuyingPack(null);
    }
  }

  const PACK_QUANTITIES = [1, 5, 10];

  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Handel</h1>
            <p className="text-gray-600 mb-6">Logga in för att köpa kortpaket.</p>
            <Button asChild>
              <Link to="/auth?tab=login">Logga in</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const diamonds = gameState?.diamonds ?? 0;
  const canClaim = gameState?.canClaimDailyDiamonds ?? false;

  return (
    <>
      {openedPack && (
        <PackOpeningModal
          packLabel={openedPack.label}
          cards={openedPack.cards}
          onClose={() => setOpenedPack(null)}
        />
      )}

      <main className="min-h-[calc(100vh-72px)] bg-gradient-to-b from-gray-50 to-white py-16">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto space-y-10">

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-2">Handel</h1>
                <p className="text-gray-600">Köp kortpaket med dina diamanter.</p>
              </div>
              <div className="flex flex-col items-start md:items-end gap-1">
                <div className="flex items-center gap-2">
                  <span className="text-3xl font-bold text-blue-600">
                    {isLoadingState ? "–" : diamonds}
                  </span>
                  <span className="text-blue-600">◆</span>
                </div>
                <Button
                  size="sm"
                  onClick={handleClaimDailyDiamonds}
                  disabled={!canClaim || isLoadingState || isClaiming}
                  variant={canClaim ? "default" : "outline"}
                  className={canClaim ? "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white" : ""}
                >
                  {isClaiming
                    ? "Hämtar..."
                    : canClaim
                      ? `Hämta ${dailyDiamonds} gratis ◆`
                      : "Diamanter hämtade idag"}
                </Button>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {collections.map((collection) => {
                const { pack } = collection;
                const canAfford = diamonds >= pack.price;
                const isBuying = buyingPack === collection.id;
                return (
                  <div
                    key={collection.id}
                    className="rounded-2xl border bg-white overflow-hidden"
                  >
                    <div className="h-2 bg-gradient-to-r from-purple-500 to-blue-500" />
                    <div className="p-6 flex flex-col gap-5">
                      <div>
                        <div className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                          {collection.label}
                        </div>
                        <div className="text-2xl font-bold">{pack.label}</div>
                        {collection.description && (
                          <div className="text-sm text-gray-500 mt-1">{collection.description}</div>
                        )}
                      </div>

                      <div className="text-sm text-gray-500">
                        {pack.cardCount} kort per pack · {pack.price} ◆ per pack
                      </div>

                      <div className="mt-auto space-y-2">
                        {!canAfford ? (
                          <p className="text-sm text-gray-400">Inte tillräckligt med diamanter.</p>
                        ) : null}
                        <div className="grid grid-cols-3 gap-2">
                          {PACK_QUANTITIES.map((qty) => {
                            const totalCost = pack.price * qty;
                            const canAffordQty = diamonds >= totalCost;
                            return (
                              <Button
                                key={qty}
                                onClick={() => void handleBuyPack(collection.id, qty)}
                                disabled={!canAffordQty || isLoadingState || !!buyingPack}
                                variant={canAffordQty ? "default" : "outline"}
                                className={`flex-col h-auto py-2 ${canAffordQty ? "bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white" : ""}`}
                              >
                                <span className="font-semibold">{isBuying ? "..." : `Köp ${qty}`}</span>
                                <span className="text-[11px] opacity-80">{totalCost} ◆</span>
                              </Button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        </div>
      </main>
    </>
  );
}
