import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cardById } from "../../data/cards";
import type { AuthUser } from "../../types/auth";
import type { CardForTrade, UserSearchResult } from "../../types/game";
import { createTrade, fetchGameState, getUserCardsForTrade, searchUsers } from "../../utils/gameApi";

type NewTradePageProps = { currentUser: AuthUser | null };

type PickerEntry = { cardId: string; max: number };

function expand(counts: Record<string, number>): string[] {
  return Object.entries(counts).flatMap(([cardId, n]) => Array.from({ length: n }, () => cardId));
}

export function NewTradePage({ currentUser }: NewTradePageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);

  const [myCardIds, setMyCardIds] = useState<string[]>([]);
  const [myDiamonds, setMyDiamonds] = useState(0);
  const [theirCards, setTheirCards] = useState<CardForTrade[]>([]);

  const [offeredCounts, setOfferedCounts] = useState<Record<string, number>>({});
  const [offeredDiamonds, setOfferedDiamonds] = useState(0);
  const [requestedCounts, setRequestedCounts] = useState<Record<string, number>>({});
  const [requestedDiamonds, setRequestedDiamonds] = useState(0);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pre-select user when coming from the card search on TradePage
  useEffect(() => {
    const id   = searchParams.get("anvandare");
    const namn = searchParams.get("namn");
    if (id && namn) setSelectedUser({ id, username: decodeURIComponent(namn) });
  }, [searchParams]);

  useEffect(() => {
    if (!currentUser) return;
    fetchGameState()
      .then((state) => {
        setMyCardIds(state.ownedCardIds);
        setMyDiamonds(state.diamonds);
      })
      .catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!selectedUser) return;
    // Only load cards the other user has marked as available for trade
    getUserCardsForTrade(selectedUser.id)
      .then((res) => setTheirCards(res.cards))
      .catch(() => {});
  }, [selectedUser]);

  useEffect(() => {
    if (query.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchUsers(query)
        .then(setSearchResults)
        .catch(() => {})
        .finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const myOwnedCounts = useMemo(
    () => myCardIds.reduce<Record<string, number>>((acc, id) => { acc[id] = (acc[id] ?? 0) + 1; return acc; }, {}),
    [myCardIds],
  );

  const myEntries: PickerEntry[] = useMemo(
    () =>
      Object.entries(myOwnedCounts)
        .map(([cardId, max]) => ({ cardId, max }))
        .sort((a, b) => (cardById(a.cardId)?.name ?? "").localeCompare(cardById(b.cardId)?.name ?? "", "sv")),
    [myOwnedCounts],
  );

  const theirEntries: PickerEntry[] = useMemo(
    () =>
      theirCards
        .map((c) => ({ cardId: c.cardId, max: c.quantity }))
        .sort((a, b) => (cardById(a.cardId)?.name ?? "").localeCompare(cardById(b.cardId)?.name ?? "", "sv")),
    [theirCards],
  );

  function adjust(setter: React.Dispatch<React.SetStateAction<Record<string, number>>>, cardId: string, next: number, max: number) {
    const clamped = Math.max(0, Math.min(max, next));
    setter((prev) => {
      const updated = { ...prev };
      if (clamped <= 0) delete updated[cardId];
      else updated[cardId] = clamped;
      return updated;
    });
  }

  async function handleSubmit() {
    if (!selectedUser) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await createTrade({
        receiverUserId: selectedUser.id,
        offeredCardIds: expand(offeredCounts),
        offeredDiamonds,
        requestedCardIds: expand(requestedCounts),
        requestedDiamonds,
      });
      navigate("/byte");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte skapa handeln.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl font-bold mb-4">Ny handel</h1>
            <p className="text-gray-600 mb-6">Logga in för att handla.</p>
            <Button asChild>
              <Link to="/auth?tab=login">Logga in</Link>
            </Button>
          </div>
        </div>
      </main>
    );
  }

  const offeredTotal = Object.values(offeredCounts).reduce((s, n) => s + n, 0);
  const requestedTotal = Object.values(requestedCounts).reduce((s, n) => s + n, 0);

  const canSubmit =
    !isSubmitting &&
    selectedUser !== null &&
    (offeredTotal > 0 || offeredDiamonds > 0) &&
    (requestedTotal > 0 || requestedDiamonds > 0);

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto space-y-8">
          <div>
            <h1 className="text-4xl font-bold mb-2">Ny handel</h1>
            <p className="text-gray-600">Välj en spelare och bygg ditt erbjudande.</p>
          </div>

          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-lg font-semibold mb-4">Välj spelare</h2>
            {selectedUser ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium flex-1">{selectedUser.username}</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSelectedUser(null);
                    setTheirCards([]);
                    setRequestedCounts({});
                  }}
                >
                  Byt spelare
                </Button>
              </div>
            ) : (
              <div className="space-y-2 max-w-sm">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Sök användarnamn..."
                  className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                />
                {isSearching && <p className="text-xs text-gray-400">Söker...</p>}
                {searchResults.length > 0 && (
                  <div className="rounded-md border divide-y">
                    {searchResults.map((u) => (
                      <button
                        key={u.id}
                        className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                        onClick={() => {
                          setSelectedUser(u);
                          setSearchResults([]);
                          setQuery("");
                        }}
                      >
                        {u.username}
                      </button>
                    ))}
                  </div>
                )}
                {!isSearching && query.length >= 2 && searchResults.length === 0 && (
                  <p className="text-xs text-gray-400">Inga spelare hittades.</p>
                )}
              </div>
            )}
          </section>

          {selectedUser && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <CardPickerPanel
                  title="Ditt erbjudande"
                  hint="Välj kort och antal du vill erbjuda."
                  entries={myEntries}
                  selected={offeredCounts}
                  onAdjust={(cardId, next, max) => adjust(setOfferedCounts, cardId, next, max)}
                  emptyMessage="Du har inga kort."
                  diamondLabel={`Diamanter att erbjuda (du har ${myDiamonds})`}
                  diamondValue={offeredDiamonds}
                  diamondMax={myDiamonds}
                  onDiamondsChange={setOfferedDiamonds}
                />
                <CardPickerPanel
                  title="Du begär"
                  hint={`Välj kort och antal du vill ha från ${selectedUser.username}.`}
                  entries={theirEntries}
                  selected={requestedCounts}
                  onAdjust={(cardId, next, max) => adjust(setRequestedCounts, cardId, next, max)}
                  emptyMessage={`${selectedUser.username} har inga kort markerade för byte.`}
                  diamondLabel="Diamanter att begära"
                  diamondValue={requestedDiamonds}
                  onDiamondsChange={setRequestedDiamonds}
                />
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}

              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => navigate("/byte")}>
                  Avbryt
                </Button>
                <Button
                  disabled={!canSubmit}
                  onClick={() => void handleSubmit()}
                  className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
                >
                  {isSubmitting ? "Skickar..." : "Skicka erbjudande"}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}

function CardPickerPanel({
  title,
  hint,
  entries,
  selected,
  onAdjust,
  emptyMessage,
  diamondLabel,
  diamondValue,
  diamondMax,
  onDiamondsChange,
}: {
  title: string;
  hint: string;
  entries: PickerEntry[];
  selected: Record<string, number>;
  onAdjust: (cardId: string, next: number, max: number) => void;
  emptyMessage: string;
  diamondLabel: string;
  diamondValue: number;
  diamondMax?: number;
  onDiamondsChange: (n: number) => void;
}) {
  return (
    <section className="rounded-2xl border bg-white p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-xs text-gray-400 mt-0.5">{hint}</p>
      </div>

      <div>
        <label className="text-xs text-gray-500 mb-1 block">{diamondLabel}</label>
        <input
          type="number"
          min={0}
          max={diamondMax}
          value={diamondValue}
          onChange={(e) => {
            const n = Math.max(0, Number(e.target.value));
            onDiamondsChange(diamondMax !== undefined ? Math.min(diamondMax, n) : n);
          }}
          className="w-32 h-8 rounded-md border border-gray-200 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
        />
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400">{emptyMessage}</p>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 overflow-y-auto max-h-96">
          {entries.map(({ cardId, max }) => {
            const card = cardById(cardId);
            if (!card) return null;
            const qty = selected[cardId] ?? 0;
            const isSelected = qty > 0;
            return (
              <div
                key={cardId}
                className={`rounded-lg p-1 flex flex-col items-center gap-1.5 transition-all ${
                  isSelected ? "ring-2 ring-purple-500 bg-purple-50" : ""
                }`}
              >
                <CardPlaceholder
                  rarity={card.rarity}
                  size="small"
                  name={card.name}
                  designKey={card.designKey}
                  showCaption
                  disableLightbox
                />
                {max === 1 ? (
                  <button
                    onClick={() => onAdjust(cardId, isSelected ? 0 : 1, max)}
                    className={`text-xs font-medium rounded-full px-3 py-0.5 transition-colors ${
                      isSelected ? "bg-purple-600 text-white" : "border border-gray-300 text-gray-600 hover:border-gray-400"
                    }`}
                  >
                    {isSelected ? "Vald" : "Välj"}
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => onAdjust(cardId, qty - 1, max)}
                      disabled={qty <= 0}
                      className="w-6 h-6 rounded-full border border-gray-300 text-gray-700 leading-none text-sm disabled:opacity-40"
                      aria-label="Minska"
                    >
                      −
                    </button>
                    <span className="text-xs font-medium tabular-nums w-8 text-center">{qty}/{max}</span>
                    <button
                      onClick={() => onAdjust(cardId, qty + 1, max)}
                      disabled={qty >= max}
                      className="w-6 h-6 rounded-full border border-gray-300 text-gray-700 leading-none text-sm disabled:opacity-40"
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
    </section>
  );
}
