import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cards, rarityOrder, type CardRarity } from "../../data/cards";
import type { AuthUser } from "../../types/auth";
import { fetchGameState, fetchMyCardsForTrade, saveCardsForTrade } from "../../utils/gameApi";

type RarityFilter = "all" | CardRarity;

type MarkForTradePageProps = {
  currentUser: AuthUser | null;
};

// Stable string key for a quantity map, so we can tell whether the draft differs
// from what was last saved.
function normalize(quantities: Record<string, number>): string {
  return Object.entries(quantities)
    .filter(([, q]) => q > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([id, q]) => `${id}:${q}`)
    .join(",");
}

export function MarkForTradePage({ currentUser }: MarkForTradePageProps) {
  const navigate = useNavigate();
  const [rarityFilter, setRarityFilter] = useState<RarityFilter>("all");
  const [ownedCardIds, setOwnedCardIds] = useState<string[]>([]);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [savedKey, setSavedKey] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) { setIsLoading(false); return; }

    setIsLoading(true);
    setError(null);

    Promise.all([fetchGameState(), fetchMyCardsForTrade()])
      .then(([state, forTrade]) => {
        setOwnedCardIds(state.ownedCardIds);
        const initial: Record<string, number> = {};
        for (const item of forTrade) initial[item.cardId] = item.quantity;
        setQuantities(initial);
        setSavedKey(normalize(initial));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda samlingen."))
      .finally(() => setIsLoading(false));
  }, [currentUser]);

  const ownedCounts = useMemo(
    () =>
      ownedCardIds.reduce<Record<string, number>>((acc, id) => {
        acc[id] = (acc[id] ?? 0) + 1;
        return acc;
      }, {}),
    [ownedCardIds],
  );

  const ownedCards = useMemo(() => {
    const owned = cards.filter((c) => (ownedCounts[c.id] ?? 0) > 0);
    const filtered = rarityFilter === "all" ? owned : owned.filter((c) => c.rarity === rarityFilter);
    return [...filtered].sort((a, b) => {
      const d = rarityOrder[a.rarity] - rarityOrder[b.rarity];
      return d !== 0 ? d : a.name.localeCompare(b.name, "sv");
    });
  }, [ownedCounts, rarityFilter]);

  function setQuantity(cardId: string, next: number) {
    const max = ownedCounts[cardId] ?? 0;
    const clamped = Math.max(0, Math.min(max, next));
    setQuantities((prev) => {
      const updated = { ...prev };
      if (clamped <= 0) delete updated[cardId];
      else updated[cardId] = clamped;
      return updated;
    });
  }

  const markedCount = useMemo(
    () => cards.filter((c) => (ownedCounts[c.id] ?? 0) > 0 && (quantities[c.id] ?? 0) > 0).length,
    [ownedCounts, quantities],
  );
  const totalCopies = useMemo(
    () => Object.values(quantities).reduce((sum, q) => sum + q, 0),
    [quantities],
  );

  const isDirty = normalize(quantities) !== savedKey;

  async function handleSave() {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const items = Object.entries(quantities)
        .filter(([, q]) => q > 0)
        .map(([cardId, quantity]) => ({ cardId, quantity }));
      const saved = await saveCardsForTrade(items);
      const next: Record<string, number> = {};
      for (const item of saved) next[item.cardId] = item.quantity;
      setQuantities(next);
      setSavedKey(normalize(next));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara.");
    } finally {
      setIsSaving(false);
    }
  }

  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl font-bold mb-4">Markera för byte</h1>
            <p className="text-gray-600 mb-6">Logga in för att hantera dina bytkort.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="py-12 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto">

          {/* Back + header */}
          <div className="mb-8">
            <button
              onClick={() => navigate("/samling")}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 0 1 0 1.06L8.06 10l3.72 3.72a.75.75 0 1 1-1.06 1.06l-4.25-4.25a.75.75 0 0 1 0-1.06l4.25-4.25a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
              Tillbaka till samlingen
            </button>

            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
              <div>
                <h1 className="text-3xl md:text-4xl font-bold mb-2">Markera för byte</h1>
                <p className="text-gray-500 text-sm">
                  Välj hur många kopior av varje kort du vill göra tillgängliga för byte, och tryck Spara.
                </p>
              </div>
              {markedCount > 0 && (
                <div className="inline-flex items-center gap-2 bg-purple-100 text-purple-700 text-sm font-medium rounded-full px-4 py-1.5 shrink-0">
                  <span className="text-purple-500">⇄</span>
                  {totalCopies} {totalCopies === 1 ? "kopia" : "kopior"} ({markedCount} {markedCount === 1 ? "kort" : "kort"})
                </div>
              )}
            </div>
          </div>

          {/* Filter + save bar */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <label className="text-sm text-gray-600 shrink-0">Visa rarity</label>
              <select
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value as RarityFilter)}
                className="h-9 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              >
                <option value="all">Alla</option>
                <option value="special">Special</option>
                <option value="legendary">Legendary</option>
                <option value="epic">Epic</option>
                <option value="rare">Rare</option>
                <option value="common">Common</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              {!isDirty && !isLoading && <span className="text-xs text-gray-400">Sparat</span>}
              <Button
                onClick={() => void handleSave()}
                disabled={!isDirty || isSaving}
                className="bg-purple-600 hover:bg-purple-700 text-white"
              >
                {isSaving ? "Sparar..." : "Spara"}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              Laddar samling...
            </div>
          ) : ownedCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-gray-500">
              Du äger inga kort i den här kategorin.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {ownedCards.map((card) => {
                const owned = ownedCounts[card.id] ?? 0;
                const qty = quantities[card.id] ?? 0;
                const isForTrade = qty > 0;

                return (
                  <div key={card.id} className="relative flex flex-col items-center gap-2">
                    <div className={`relative rounded-xl transition-all duration-150 ${
                      isForTrade ? "ring-2 ring-purple-500 ring-offset-2" : ""
                    }`}>
                      <CardPlaceholder
                        rarity={card.rarity}
                        size="small"
                        name={card.name}
                        danceStyle={card.danceStyle}
                        designKey={card.designKey}
                        showCaption
                        disableLightbox
                      />
                      {owned > 1 && (
                        <div className="absolute top-1.5 right-1.5 z-10 bg-black/70 text-white text-[10px] font-bold rounded px-1.5 py-0.5 leading-none pointer-events-none">
                          ×{owned}
                        </div>
                      )}
                      {isForTrade && (
                        <div className="absolute top-1.5 left-1.5 z-10 bg-purple-600 text-white text-[10px] font-bold rounded-full px-2 py-0.5 leading-none pointer-events-none">
                          ⇄
                        </div>
                      )}
                    </div>

                    {/* Quantity control */}
                    {owned === 1 ? (
                      <button
                        onClick={() => setQuantity(card.id, qty > 0 ? 0 : 1)}
                        className={`text-xs font-medium rounded-full px-3 py-1 transition-colors ${
                          isForTrade
                            ? "bg-purple-600 text-white hover:bg-purple-700"
                            : "border border-gray-300 text-gray-600 hover:border-gray-400"
                        }`}
                      >
                        {isForTrade ? "Markerad" : "Markera"}
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setQuantity(card.id, qty - 1)}
                          disabled={qty <= 0}
                          className="w-7 h-7 rounded-full border border-gray-300 text-gray-700 leading-none disabled:opacity-40 hover:border-gray-400"
                          aria-label="Minska"
                        >
                          −
                        </button>
                        <span className="text-sm font-medium tabular-nums w-10 text-center">{qty}/{owned}</span>
                        <button
                          onClick={() => setQuantity(card.id, qty + 1)}
                          disabled={qty >= owned}
                          className="w-7 h-7 rounded-full border border-gray-300 text-gray-700 leading-none disabled:opacity-40 hover:border-gray-400"
                          aria-label="Öka"
                        >
                          +
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {error && <p className="mt-6 text-sm text-red-600">{error}</p>}

        </div>
      </div>
    </main>
  );
}
