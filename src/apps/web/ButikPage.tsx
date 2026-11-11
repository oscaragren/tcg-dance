import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { ChestsSection } from "../../components/web/ChestsSection";
import { PackOpeningModal } from "../../components/web/PackOpeningModal";
import { SmCollectionDisclaimer } from "../../components/web/SmCollectionDisclaimer";
import { collections, isPackPurchasable, packReleaseLabel } from "../../data/packs";
import { useNow } from "../../utils/useNow";
import type { AuthUser } from "../../types/auth";
import type { CollectionConfig } from "../../data/buildCardCatalog";
import type { DanceCard } from "../../types/danceCard";
import type { CollectionAvailability, GameState } from "../../types/game";
import { buyPack, fetchAvailability, fetchGameState } from "../../utils/gameApi";
import { cards } from "../../data/cards";
import { resolveCardDesignUrl } from "../../data/cardDesignUrls";
import { DiamondIcon } from "../../components/web/DiamondIcon";

type ButikPageProps = { currentUser: AuthUser | null };

export function ButikPage({ currentUser }: ButikPageProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(!!currentUser);
  const [buyingPack, setBuyingPack] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedPack, setOpenedPack] = useState<{ label: string; cards: DanceCard[] } | null>(null);
  const [availability, setAvailability] = useState<CollectionAvailability>({});
  // Ticks so a scheduled pack release unlocks without reloading the page.
  const now = useNow();

  useEffect(() => {
    if (!currentUser) return;
    fetchGameState()
      .then(setGameState)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda speldata."))
      .finally(() => setIsLoadingState(false));
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser) return;
    fetchAvailability().then(setAvailability).catch(() => {});
  }, [currentUser]);

  async function handleBuyPack(collectionId: string, quantity: number) {
    if (buyingPack) return;
    setBuyingPack(collectionId);
    setError(null);
    try {
      const result = await buyPack(collectionId, quantity);
      setGameState(result.state);
      fetchAvailability().then(setAvailability).catch(() => {});
      const col = collections.find((c) => c.id === collectionId);
      const label = col?.pack.label ?? "Pack";
      setOpenedPack({ label: quantity > 1 ? `${quantity} × ${label}` : label, cards: result.pulledCards });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte köpa pack.");
    } finally {
      setBuyingPack(null);
    }
  }

  if (!currentUser) {
    return (
      <main className="py-16 bg-raised min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-surface border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Butik</h1>
            <p className="text-text mb-6">Logga in för att köpa kortpaket.</p>
            <Button asChild>
              <Link to="/auth?tab=login">Logga in</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const diamonds = gameState?.diamonds ?? 0;

  return (
    <>
      {openedPack && (
        <PackOpeningModal
          packLabel={openedPack.label}
          cards={openedPack.cards}
          onClose={() => setOpenedPack(null)}
        />
      )}

      <main className="min-h-[calc(100vh-72px)] bg-background py-16">
        <div className="container mx-auto px-6">
          <div className="max-w-5xl mx-auto space-y-10">

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-2">Butik</h1>
                <p className="text-text">Köp kortpaket och kistor med dina diamanter.</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-3xl font-bold text-diamonds">
                  {isLoadingState ? "–" : diamonds}
                </span>
                <span className="text-diamonds"><DiamondIcon /></span>
              </div>
            </div>

            {error && <p className="text-sm text-danger">{error}</p>}

            <section className="space-y-4">
              <h2 className="font-display text-2xl font-bold">Packs</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {collections.map((collection) => (
                  <PackCard
                    key={collection.id}
                    collection={collection}
                    diamonds={diamonds}
                    soldOut={availability[collection.id]?.soldOut === true}
                    purchasable={isPackPurchasable(collection, now)}
                    releaseLabel={packReleaseLabel(collection, now)}
                    isBuying={buyingPack === collection.id}
                    disabled={isLoadingState || !!buyingPack}
                    onBuy={(qty) => void handleBuyPack(collection.id, qty)}
                  />
                ))}
              </div>
            </section>

            <SmCollectionDisclaimer />

            <ChestsSection diamonds={diamonds} onState={setGameState} />

          </div>
        </div>
      </main>
    </>
  );
}

const PACK_QUANTITIES = [1, 5, 10];

/** Up to three Cards of the Collection's top Rarities, fanned out as cover art. */
function coverArt(collectionId: string): string[] {
  return cards
    .filter((c) => c.collectionId === collectionId && (c.rarity === "legendary" || c.rarity === "epic"))
    .map((c) => resolveCardDesignUrl(c.designKey))
    .filter((url): url is string => !!url)
    .slice(0, 3);
}

type PackCardProps = {
  collection: CollectionConfig;
  diamonds: number;
  soldOut: boolean;
  purchasable: boolean;
  releaseLabel: string | null;
  isBuying: boolean;
  disabled: boolean;
  onBuy: (quantity: number) => void;
};

/** One big Pack card per live Collection (Skyltfönster). */
function PackCard({ collection, diamonds, soldOut, purchasable, releaseLabel, isBuying, disabled, onBuy }: PackCardProps) {
  const { pack } = collection;
  const art = coverArt(collection.id);
  const buyable = purchasable && !soldOut;
  return (
    <div className="overflow-hidden rounded-2xl border bg-surface">
      <div className="relative flex h-44 items-center justify-center bg-raised" aria-hidden>
        {art.map((url, i) => (
          <img
            key={url}
            src={url}
            alt=""
            className="absolute h-36 w-28 rounded-lg border-2 border-hairline-strong object-cover object-top shadow-lg"
            style={{ transform: `translateX(${(i - (art.length - 1) / 2) * 60}px) rotate(${(i - (art.length - 1) / 2) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }}
          />
        ))}
        {soldOut && (
          <span className="absolute right-3 top-3 z-10 rounded-full bg-background/80 px-3 py-1 text-xs font-semibold text-danger">Slutsålt</span>
        )}
      </div>
      <div className="space-y-4 p-5">
        <div>
          <div className="text-xs font-medium uppercase tracking-wider text-tertiary">{collection.label}</div>
          <div className="font-display text-2xl font-bold">{pack.label}</div>
          <div className="text-sm text-secondary">
            {pack.cardCount} kort per pack{collection.description ? ` · ${collection.description}` : ""}
          </div>
        </div>
        {!purchasable && (
          <p className="text-sm text-secondary">
            {releaseLabel ?? "Kommer snart"}. Korten finns redan i{" "}
            <Link to="/samling" className="text-accent hover:underline">Samling</Link>{" "}
            och kan fås via kistor och byten.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {PACK_QUANTITIES.map((qty) => {
            const totalCost = pack.price * qty;
            const canAfford = buyable && diamonds >= totalCost;
            return (
              <Button
                key={qty}
                onClick={() => onBuy(qty)}
                disabled={!canAfford || disabled}
                variant={canAfford ? "default" : "outline"}
                className={`h-auto flex-col py-2 ${canAfford ? "bg-accent text-accent-on hover:bg-accent/90" : ""}`}
              >
                <span className="font-semibold">{isBuying ? "..." : `Köp ${qty}`}</span>
                {!soldOut && <span className="text-[11px] opacity-80">{totalCost} <DiamondIcon /></span>}
              </Button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
