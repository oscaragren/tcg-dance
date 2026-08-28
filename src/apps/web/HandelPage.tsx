import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPoolPeek } from "../../components/web/CardPoolPeek";
import { PackOpeningModal } from "../../components/web/PackOpeningModal";
import { SmCollectionDisclaimer } from "../../components/web/SmCollectionDisclaimer";
import { collections, dailyDiamonds } from "../../data/packs";
import type { AuthUser } from "../../types/auth";
import type { DanceCard } from "../../types/danceCard";
import type { GameState } from "../../types/game";
import type { ChestsResponse, ChestType } from "../../types/game";
import { buyChest, buyPack, claimDailyDiamonds, fetchChests, fetchGameState } from "../../utils/gameApi";

type HandelPageProps = { currentUser: AuthUser | null };

export function HandelPage({ currentUser }: HandelPageProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(!!currentUser);
  const [isClaiming, setIsClaiming] = useState(false);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedPack, setOpenedPack] = useState<{ label: string; cards: DanceCard[] } | null>(null);
  const [chests, setChests] = useState<ChestsResponse | null>(null);
  const [buyingChest, setBuyingChest] = useState<ChestType | null>(null);
  const [chestNotice, setChestNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    fetchGameState()
      .then(setGameState)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda speldata."))
      .finally(() => setIsLoadingState(false));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetchChests().then(setChests).catch(() => {});
  }, [currentUser]);

  async function handleBuyChest(type: ChestType, label: string) {
    if (buyingChest) return;
    setBuyingChest(type);
    setError(null);
    setChestNotice(null);
    try {
      const result = await buyChest(type);
      setChests(result);
      setGameState(result.state);
      setChestNotice(`${label} köpt! Den låses upp i Samling när tiden gått ut.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte köpa kistan.");
    } finally {
      setBuyingChest(null);
    }
  }

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
                    className="rounded-2xl border bg-white"
                  >
                    <div className="h-2 rounded-t-2xl bg-gradient-to-r from-purple-500 to-blue-500" />
                    <div className="p-6 flex flex-col gap-5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-medium uppercase tracking-wider text-gray-400 mb-1">
                            {collection.label}
                          </div>
                          <div className="text-2xl font-bold">{pack.label}</div>
                          {collection.description && (
                            <div className="text-sm text-gray-500 mt-1">{collection.description}</div>
                          )}
                        </div>
                        {/* Scoped to this collection, so each pack card reports its own pool. */}
                        <CardPoolPeek collectionId={collection.id} label={collection.label} />
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

            <SmCollectionDisclaimer />

            {/* Chests — cheap, slow-burn rewards. Bought here, opened in Samling. */}
            {chests && (
              <section className="space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-2">
                  <div>
                    <h2 className="text-2xl font-bold">Kistor</h2>
                    <p className="text-sm text-gray-600">
                      Köp en kista, vänta ut klockan och hämta diamanter (och kanske ett kort) i{" "}
                      <Link to="/samling" className="text-purple-600 hover:underline">Samling</Link>. Din
                      fria plats tar en kista i taget — fasta platser per sort köper du i Samling.
                    </p>
                  </div>
                  <div className="text-sm text-gray-500">
                    {chests.chests.length} / {chests.slots} kistplatser upptagna
                  </div>
                </div>

                {chestNotice && <p className="text-sm text-green-600">{chestNotice}</p>}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {chests.types.map((chest) => {
                    const canAfford = diamonds >= chest.price;
                    // The server decides whether this specific type fits: its own
                    // dedicated slot, or the free one if that is still empty.
                    const slotsFull = !chests.canStore[chest.id];
                    return (
                      <div key={chest.id} className="rounded-2xl border bg-white overflow-hidden flex flex-col">
                        <div className={`h-2 bg-gradient-to-r ${CHEST_ACCENT[chest.id]}`} />
                        <div className="p-5 flex flex-col gap-3 flex-1">
                          <div className="flex items-center gap-3">
                            <span className="text-3xl" aria-hidden>{CHEST_EMOJI[chest.id]}</span>
                            <div>
                              <div className="font-bold">{chest.label}</div>
                              <div className="text-xs text-gray-500">{chest.price} ◆</div>
                            </div>
                          </div>
                          <ul className="text-xs text-gray-500 space-y-1">
                            <li>{chest.diamondMin}–{chest.diamondMax} ◆</li>
                            <li>Chans på kort</li>
                            <li>Låses upp efter {chest.waitHours} tim</li>
                          </ul>
                          <Button
                            onClick={() => void handleBuyChest(chest.id, chest.label)}
                            disabled={!canAfford || slotsFull || !!buyingChest || isLoadingState}
                            variant={canAfford && !slotsFull ? "default" : "outline"}
                            className={`mt-auto ${canAfford && !slotsFull ? "bg-gradient-to-r from-amber-600 to-yellow-500 hover:from-amber-700 hover:to-yellow-600 text-white" : ""}`}
                          >
                            {buyingChest === chest.id
                              ? "Köper..."
                              : slotsFull
                                ? "Ingen ledig plats"
                                : canAfford
                                  ? `Köp för ${chest.price} ◆`
                                  : "För få diamanter"}
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

          </div>
        </div>
      </main>
    </>
  );
}

const CHEST_EMOJI: Record<string, string> = { bronze: "🥉", silver: "🥈", gold: "🥇" };

const CHEST_ACCENT: Record<string, string> = {
  bronze: "from-amber-700 to-amber-500",
  silver: "from-gray-400 to-gray-300",
  gold: "from-yellow-500 to-amber-300",
};
