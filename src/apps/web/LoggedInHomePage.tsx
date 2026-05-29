import { useEffect, useState } from "react";
import { FeaturedCollection } from "../../components/web/FeaturedCollection";
import { HeroSection } from "../../components/web/HeroSection";
import { PackOpeningModal } from "../../components/web/PackOpeningModal";
import { PhotographerPromo } from "../../components/web/PhotographerPromo";
import type { DanceCard } from "../../data/cards";
import { collections } from "../../data/packs";
import type { GameState } from "../../types/game";
import { buyPack, claimDailyDiamonds, fetchGameState } from "../../utils/gameApi";

const featuredCollection = collections[collections.length - 1];

type LoggedInHomePageProps = {
  username: string;
  userEmail: string;
};

export function LoggedInHomePage({ username, userEmail }: LoggedInHomePageProps) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [buyingPack, setBuyingPack] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openedPack, setOpenedPack] = useState<{ label: string; cards: DanceCard[] } | null>(null);

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

  async function handleBuyFeaturedPack() {
    if (!featuredCollection || buyingPack) return;
    setBuyingPack(true);
    setBuyError(null);
    try {
      const result = await buyPack(featuredCollection.id);
      setGameState(result.state);
      setOpenedPack({ label: featuredCollection.pack.label, cards: result.pulledCards });
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : "Kunde inte köpa pack.");
    } finally {
      setBuyingPack(false);
    }
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

      <main className="min-h-[calc(100vh-72px)]">

        <HeroSection
          username={username}
          diamonds={diamonds}
          canClaim={canClaim}
          isLoading={isLoadingState}
          isClaiming={isClaiming}
          error={error}
          onClaim={() => void handleClaimDailyDiamonds()}
        />

        {featuredCollection && (
          <FeaturedCollection
            collection={featuredCollection}
            diamonds={isLoadingState ? undefined : diamonds}
            onBuy={() => void handleBuyFeaturedPack()}
            isBuying={buyingPack}
            buyError={buyError ?? undefined}
          />
        )}

        <PhotographerPromo />

      </main>
    </>
  );
}
