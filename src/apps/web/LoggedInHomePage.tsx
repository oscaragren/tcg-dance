import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cardById, rarityOrder, type DanceCard } from "../../data/cards";
import { openPack, packConfigs } from "../../data/packs";

type LoggedInHomePageProps = {
  username: string;
  userEmail: string;
};

export function LoggedInHomePage({ username, userEmail }: LoggedInHomePageProps) {
  const [openedCards, setOpenedCards] = useState<DanceCard[]>([]);
  const [canClaimDailyPack, setCanClaimDailyPack] = useState(false);
  const [isLoadingState, setIsLoadingState] = useState(true);
  const [isClaiming, setIsClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadState() {
      try {
        const state = await fetchGameState();
        setOpenedCards(state.lastOpenedCards);
        setCanClaimDailyPack(state.canClaimDailyPack);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Kunde inte ladda speldata.");
      } finally {
        setIsLoadingState(false);
      }
    }

    void loadState();
  }, [userEmail]);

  const sortedOpenedCards = useMemo(
    () =>
      [...openedCards].sort((a, b) => {
        const rarityDiff = rarityOrder[a.rarity] - rarityOrder[b.rarity];
        if (rarityDiff !== 0) {
          return rarityDiff;
        }
        return a.name.localeCompare(b.name, "sv");
      }),
    [openedCards],
  );

  async function handleClaimDailyPack() {
    if (!canClaimDailyPack || isClaiming) {
      return;
    }

    setIsClaiming(true);
    setError(null);
    try {
      const result = await claimDailyPack();
      setOpenedCards(result.pulledCards);
      setCanClaimDailyPack(result.state.canClaimDailyPack);
    } catch (claimError) {
      setError(claimError instanceof Error ? claimError.message : "Kunde inte claima dagspack.");
    } finally {
      setIsClaiming(false);
    }
  }

  return (
    <main className="min-h-[calc(100vh-72px)] bg-gradient-to-b from-gray-50 to-white py-16">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto space-y-10">
          <section className="rounded-2xl border bg-white p-8 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div>
                <h1 className="text-4xl md:text-5xl font-bold mb-3">Välkommen, {username}!</h1>
                <p className="text-gray-600 max-w-2xl">
                  Det här är din startsida. Här kan du varje dag claima och öppna ditt gratis Dagspack.
                </p>
              </div>
              <Button
                size="lg"
                onClick={handleClaimDailyPack}
                disabled={!canClaimDailyPack || isLoadingState || isClaiming}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                {isClaiming
                  ? "Claimar..."
                  : canClaimDailyPack
                    ? "Claima Dagspack"
                    : "Dagspack redan claimat idag"}
              </Button>
            </div>

            <div className="mt-6 text-sm text-gray-600">
              {isLoadingState
                ? "Laddar din spelstatus..."
                : canClaimDailyPack
                ? "Du kan claima ditt gratis Dagspack nu."
                : "Du har redan claimat ditt Dagspack idag. Kom tillbaka imorgon."}
            </div>
            {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          </section>

          <section className="rounded-2xl border bg-white p-8">
            <h2 className="text-2xl font-bold mb-2">Pack-översikt</h2>
            <p className="text-gray-600 mb-6">
              Bronspack, Silverpack och Guldpack blir köpbara senare. Dagspack kan claimas gratis varje dag.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {Object.entries(packConfigs).map(([packKey, config]) => (
                <div key={packKey} className="rounded-xl border bg-gray-50 p-4">
                  <div className="font-semibold">{config.label}</div>
                  <div className="text-sm text-gray-600 mt-1">{config.cardCount} kort</div>
                  <div className="text-xs text-gray-500 mt-3 space-y-1">
                    <div>Legendary: {(config.rarityChances.legendary * 100).toFixed(0)}%</div>
                    <div>Epic: {(config.rarityChances.epic * 100).toFixed(0)}%</div>
                    <div>Rare: {(config.rarityChances.rare * 100).toFixed(0)}%</div>
                    <div>Common: {(config.rarityChances.common * 100).toFixed(0)}%</div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border bg-white p-8">
            <div className="flex items-center justify-between gap-4 mb-6">
              <h2 className="text-2xl font-bold">Senast öppnade Dagspack</h2>
              <Button asChild variant="outline">
                <Link to="/samling">Gå till Samling</Link>
              </Button>
            </div>

            {sortedOpenedCards.length === 0 ? (
              <p className="text-gray-600">Du har inte öppnat något Dagspack ännu idag.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {sortedOpenedCards.map((card, index) => {
                  const canonical = cardById(card.id) ?? card;
                  return (
                    <div key={`${card.id}-${index}`} className="space-y-2">
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
