import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { UpgradePickerModal } from "../../components/web/UpgradePickerModal";
import { UpgradeRevealModal } from "../../components/web/UpgradeRevealModal";
import { cards } from "../../data/cards";
import { collections } from "../../data/packs";
import type { AuthUser } from "../../types/auth";
import type { CardRarity, DanceCard } from "../../types/danceCard";
import { upgradeCardsRequired, upgradeTierTarget, type CardPoolInfo, type GameState } from "../../types/game";
import { fetchCardPool, fetchGameState, upgradeCards } from "../../utils/gameApi";

type UpgradePageProps = { currentUser: AuthUser | null };

const RARITY_LABEL: Record<CardRarity, string> = {
  common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", special: "Special",
};

export function UpgradePage({ currentUser }: UpgradePageProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [poolInfo, setPoolInfo] = useState<CardPoolInfo>({});
  const [isLoading, setIsLoading] = useState(!!currentUser);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pickerGroup, setPickerGroup] = useState<{ collectionId: string; rarity: CardRarity } | null>(null);
  const [revealCard, setRevealCard] = useState<DanceCard | null>(null);

  useEffect(() => {
    if (!currentUser) return;
    Promise.all([fetchGameState(), fetchCardPool()])
      .then(([state, pool]) => { setGameState(state); setPoolInfo(pool); })
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda speldata."))
      .finally(() => setIsLoading(false));
  }, [currentUser]);

  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Uppgradering</h1>
            <p className="text-gray-600 mb-6">Logga in för att uppgradera dina kort.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  const ownedCounts = (gameState?.ownedCardIds ?? []).reduce<Record<string, number>>((acc, id) => {
    acc[id] = (acc[id] ?? 0) + 1;
    return acc;
  }, {});

  function ownedCountFor(collectionId: string, rarity: CardRarity) {
    return cards
      .filter((c) => c.collectionId === collectionId && c.rarity === rarity)
      .reduce((sum, c) => sum + (ownedCounts[c.id] ?? 0), 0);
  }

  function targetTierHasStock(collectionId: string, targetRarity: CardRarity) {
    return cards
      .filter((c) => c.collectionId === collectionId && c.rarity === targetRarity)
      .some((c) => (poolInfo[c.id]?.copiesRemaining ?? 0) > 0);
  }

  async function handleConfirmUpgrade(cardIds: string[]) {
    if (isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const response = await upgradeCards(cardIds);
      setGameState(response.state);
      setPickerGroup(null);
      setRevealCard(response.upgradedCard);
      const pool = await fetchCardPool();
      setPoolInfo(pool);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte uppgradera korten.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      {pickerGroup && (
        <UpgradePickerModal
          collectionId={pickerGroup.collectionId}
          rarity={pickerGroup.rarity}
          ownedCardIds={gameState?.ownedCardIds ?? []}
          requiredCount={upgradeCardsRequired[pickerGroup.rarity] ?? 0}
          isSubmitting={isSubmitting}
          onConfirm={handleConfirmUpgrade}
          onClose={() => setPickerGroup(null)}
        />
      )}

      {revealCard && (
        <UpgradeRevealModal card={revealCard} onClose={() => setRevealCard(null)} />
      )}

      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto space-y-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-bold mb-3">Uppgradering</h1>
            <p className="text-gray-600">
              Kombinera kort av samma raritet och kortpaket till ett slumpmässigt kort en nivå högre.
              Antalet kort som krävs beror på rariteten: {upgradeCardsRequired.common} common, {upgradeCardsRequired.rare} rare, {upgradeCardsRequired.epic} epic.
            </p>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {isLoading ? (
            <p className="text-gray-500">Laddar...</p>
          ) : (
            <div className="space-y-6">
              {collections.map((collection) => (
                <div key={collection.id} className="rounded-2xl border bg-white p-6">
                  <h2 className="text-lg font-semibold mb-4">{collection.label}</h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(["common", "rare", "epic"] as CardRarity[]).map((rarity) => {
                      const targetRarity = upgradeTierTarget[rarity];
                      if (!targetRarity) return null;
                      const required = upgradeCardsRequired[rarity] ?? 0;
                      const owned = ownedCountFor(collection.id, rarity);
                      const hasStock = targetTierHasStock(collection.id, targetRarity);
                      const canUpgrade = owned >= required && hasStock;

                      return (
                        <div key={rarity} className="rounded-lg border px-4 py-3">
                          <div className="text-sm font-medium">
                            {RARITY_LABEL[rarity]} → {RARITY_LABEL[targetRarity]}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {Math.min(owned, required)}/{required} kort
                          </div>
                          <Button
                            size="sm"
                            className="mt-3 w-full bg-purple-600 hover:bg-purple-700 text-white"
                            disabled={!canUpgrade}
                            onClick={() => setPickerGroup({ collectionId: collection.id, rarity })}
                          >
                            {!hasStock ? "Inga kort kvar" : "Välj kort"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
