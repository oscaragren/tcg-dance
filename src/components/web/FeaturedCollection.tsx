import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import type { CollectionConfig } from "../../data/buildCardCatalog";
import { isPackPurchasable, packReleaseLabel } from "../../data/packs";
import { useNow } from "../../utils/useNow";
import { DiamondIcon } from "./DiamondIcon";

type FeaturedCollectionProps = {
  collection: CollectionConfig;
  /** Passed when user is logged in — enables inline buy. */
  diamonds?: number;
  onBuy?: () => void;
  isBuying?: boolean;
  buyError?: string;
};

export function FeaturedCollection({
  collection,
  diamonds,
  onBuy,
  isBuying = false,
  buyError,
}: FeaturedCollectionProps) {
  const { pack } = collection;
  const isLoggedIn = onBuy !== undefined;
  const canAfford  = diamonds !== undefined && diamonds >= pack.price;
  // Newest collection may be live before its pack goes on sale.
  const now = useNow();
  const purchasable = isPackPurchasable(collection, now);
  const releaseLabel = packReleaseLabel(collection, now);

  return (
    <section className="bg-surface py-20">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-raised text-text text-xs uppercase tracking-wider mb-4">
                Nyaste kollektion
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-text mb-3">{collection.label}</h2>
              {collection.description && (
                <p className="text-tertiary text-lg mb-6">{collection.description}</p>
              )}

              {isLoggedIn && !purchasable ? (
                <div className="space-y-3">
                  <Button
                    size="lg"
                    disabled
                    className="bg-text/10 border border-hairline/20 text-text/70 font-semibold text-base"
                  >
                    {releaseLabel ? `${pack.label} · ${releaseLabel}` : `${pack.label} släpps snart`}
                  </Button>
                  <p className="text-xs text-tertiary">
                    Korten finns redan i{" "}
                    <Link to="/samling" className="text-text underline hover:text-text underline underline">Samling</Link>{" "}
                    och kan fås via kistor och byten.
                  </p>
                </div>
              ) : isLoggedIn ? (
                <div className="space-y-3">
                  <div className="text-tertiary text-sm">
                    Du har <span className="text-text font-semibold">{diamonds}</span> <DiamondIcon />
                  </div>
                  <Button
                    size="lg"
                    onClick={onBuy}
                    disabled={isBuying || !canAfford}
                    className="bg-accent hover:bg-accent/90 text-text underline-on font-semibold text-base"
                  >
                    {isBuying
                      ? "Öppnar..."
                      : canAfford
                        ? <>Köp {pack.label} — {pack.price} <DiamondIcon /></>
                        : <>Inte tillräckligt ({pack.price} <DiamondIcon /> krävs)</>}
                  </Button>
                  {!canAfford && (
                    <p className="text-xs text-secondary">
                      Hämta dina dagliga diamanter för att köpa fler pack.
                    </p>
                  )}
                  {buyError && <p className="text-sm text-danger">{buyError}</p>}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    asChild size="lg"
                    className="bg-accent hover:bg-accent/90 text-text underline-on font-semibold"
                  >
                    <Link to="/auth?tab=register">Registrera dig gratis</Link>
                  </Button>
                  <Button asChild size="lg" className="bg-text/10 border border-hairline/30 text-text hover:bg-text/20">
                    <Link to="/auth?tab=login">Logga in</Link>
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-hairline/10 bg-text/5 backdrop-blur p-6 space-y-5">
              <div>
                <div className="text-text font-semibold text-lg mb-1">{pack.label}</div>
                <div className="text-tertiary text-sm">{pack.cardCount} kort per pack</div>
              </div>

              <div className="pt-2 border-t border-hairline/10 flex items-center justify-between">
                <span className="text-tertiary text-sm">Pris</span>
                <span className="text-text font-bold text-xl">{pack.price} <DiamondIcon /></span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
