import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import type { CollectionConfig } from "../../data/buildCardCatalog";
import { cards } from "../../data/cards";
import type { CardPoolInfo } from "../../types/game";
import { fetchCardPool } from "../../utils/gameApi";

type FeaturedCollectionProps = {
  collection: CollectionConfig;
  /** Passed when user is logged in — enables inline buy. */
  diamonds?: number;
  onBuy?: () => void;
  isBuying?: boolean;
  buyError?: string;
};

const RARITIES = [
  { key: "special",   label: "Special",   color: "text-fuchsia-400", zero: "text-red-400" },
  { key: "legendary", label: "Legendary", color: "text-amber-400",  zero: "text-red-400" },
  { key: "epic",      label: "Epic",      color: "text-purple-400", zero: "text-red-400" },
  { key: "rare",      label: "Rare",      color: "text-blue-400",   zero: "text-red-400" },
  { key: "common",    label: "Common",    color: "text-gray-400",   zero: "text-red-400" },
] as const;

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

  const [poolInfo, setPoolInfo] = useState<CardPoolInfo>({});

  useEffect(() => {
    fetchCardPool().then(setPoolInfo).catch(() => {});
  }, []);

  const remaining = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of cards) {
      if (card.collectionId !== collection.id) continue;
      const entry = poolInfo[card.id];
      if (entry === undefined) continue;
      counts[card.rarity] = (counts[card.rarity] ?? 0) + entry.copiesRemaining;
    }
    return counts;
  }, [poolInfo, collection.id]);

  const poolLoaded = Object.keys(poolInfo).length > 0;

  return (
    <section className="bg-gradient-to-br from-gray-900 via-purple-950 to-gray-900 py-20">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">

            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs uppercase tracking-wider mb-4">
                Nyaste kollektion
              </div>
              <h2 className="text-4xl md:text-5xl font-bold text-white mb-3">{collection.label}</h2>
              {collection.description && (
                <p className="text-gray-300 text-lg mb-6">{collection.description}</p>
              )}

              {isLoggedIn ? (
                <div className="space-y-3">
                  <div className="text-gray-300 text-sm">
                    Du har <span className="text-white font-semibold">{diamonds}</span> ◆
                  </div>
                  <Button
                    size="lg"
                    onClick={onBuy}
                    disabled={isBuying || !canAfford}
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold text-base"
                  >
                    {isBuying
                      ? "Öppnar..."
                      : canAfford
                        ? `Köp ${pack.label} — ${pack.price} ◆`
                        : `Inte tillräckligt (${pack.price} ◆ krävs)`}
                  </Button>
                  {!canAfford && (
                    <p className="text-xs text-gray-500">
                      Hämta dina dagliga diamanter för att köpa fler pack.
                    </p>
                  )}
                  {buyError && <p className="text-sm text-red-400">{buyError}</p>}
                </div>
              ) : (
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    asChild size="lg"
                    className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white font-semibold"
                  >
                    <Link to="/auth?tab=register">Registrera dig gratis</Link>
                  </Button>
                  <Button asChild size="lg" className="bg-white/10 border border-white/30 text-white hover:bg-white/20">
                    <Link to="/auth?tab=login">Logga in</Link>
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur p-6 space-y-5">
              <div>
                <div className="text-white font-semibold text-lg mb-1">{pack.label}</div>
                <div className="text-gray-400 text-sm">{pack.cardCount} kort per pack</div>
              </div>

              <div className="space-y-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider">Kort kvar i poolen</div>
                {RARITIES.map(({ key, label, color, zero }) => {
                  const count = remaining[key];
                  const loaded = poolLoaded;
                  const soldOut = loaded && count === 0;
                  return (
                    <div key={key} className="flex items-center justify-between">
                      <span className={`text-sm font-medium ${color}`}>{label}</span>
                      <span className={`text-sm font-semibold ${soldOut ? zero : "text-white"}`}>
                        {!loaded ? "–" : soldOut ? "Slutsåld" : `${count} kvar`}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t border-white/10 flex items-center justify-between">
                <span className="text-gray-400 text-sm">Pris</span>
                <span className="text-white font-bold text-xl">{pack.price} ◆</span>
              </div>
            </div>

          </div>
        </div>
      </div>
    </section>
  );
}
