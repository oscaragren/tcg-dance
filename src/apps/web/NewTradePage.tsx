import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardThumb } from "../../components/web/CardThumb";
import { TradePickerList, TradePickerSheet, type PickerEntry } from "../../components/web/TradePickerSheet";
import { cardById } from "../../data/cards";
import type { AuthUser } from "../../types/auth";
import type { CardForTrade, MarketTraderForCard, RarityTotals, Trade, UserSearchResult } from "../../types/game";
import {
  counterTrade,
  createTrade,
  fetchGameState,
  fetchMyTrades,
  findTradersForCard,
  getPlayerProfile,
  getUserCardsForTrade,
  searchUsers,
} from "../../utils/gameApi";
import { copyStatusLabel, formatRarityTotals } from "../../utils/tradeSummary";

type NewTradePageProps = { currentUser: AuthUser | null };
type Counts = Record<string, number>;

const tally = (ids: string[]): Counts =>
  ids.reduce<Counts>((acc, id) => { acc[id] = (acc[id] ?? 0) + 1; return acc; }, {});

const toQuantities = (items: CardForTrade[]): Counts =>
  Object.fromEntries(items.map((c) => [c.cardId, c.quantity]));

function expand(counts: Counts): string[] {
  return Object.entries(counts).flatMap(([cardId, n]) => Array.from({ length: n }, () => cardId));
}

function rarityTotalsOf(counts: Counts): RarityTotals {
  const totals: RarityTotals = {};
  for (const [cardId, n] of Object.entries(counts)) {
    const rarity = cardById(cardId)?.rarity;
    if (rarity) totals[rarity] = (totals[rarity] ?? 0) + n;
  }
  return totals;
}

/** "Kort A, Kort B · 50 ◆" — one side of an offer, for the counter summary. */
function describeSide(cardIds: string[], diamonds: number): string {
  const names = cardIds.map((id) => cardById(id)?.name ?? id);
  const parts = [];
  if (names.length > 0) parts.push(names.join(", "));
  if (diamonds > 0) parts.push(`${diamonds} ◆`);
  return parts.join(" · ") || "—";
}

/**
 * The one Trade builder, reached from Matchningar, Hitta byte, Sök spelare,
 * a player's page and counter-offers. "Du får" and "Du ger" stack, each with a
 * + tile that opens a picker sheet; a sticky summary compares Rarity totals.
 */
export function NewTradePage({ currentUser }: NewTradePageProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<UserSearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserSearchResult | null>(null);

  const [myOwned, setMyOwned] = useState<Counts>({});
  const [myAvailable, setMyAvailable] = useState<Counts>({});
  const [myDiamonds, setMyDiamonds] = useState(0);
  const [theirOwned, setTheirOwned] = useState<Counts>({});
  const [theirAvailable, setTheirAvailable] = useState<Counts>({});

  const [offered, setOffered] = useState<Counts>({});
  const [offeredDiamonds, setOfferedDiamonds] = useState(0);
  const [requested, setRequested] = useState<Counts>({});
  const [requestedDiamonds, setRequestedDiamonds] = useState(0);
  const [sheet, setSheet] = useState<"get" | "give" | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // "Hitta byte": a Card already requested, and (until a player is chosen) the
  // players who have it available.
  const wantedCardId = searchParams.get("kort");
  const [holders, setHolders] = useState<MarketTraderForCard[] | null>(null);

  // "Motbjud": the counterparty is fixed and submitting answers that Trade.
  const counterOfTradeId = searchParams.get("motbud");
  const isCounter = counterOfTradeId !== null;
  const [originalTrade, setOriginalTrade] = useState<Trade | null>(null);

  useEffect(() => {
    const id = searchParams.get("anvandare");
    const namn = searchParams.get("namn");
    if (id && namn) setSelectedUser({ id, username: decodeURIComponent(namn) });
  }, [searchParams]);

  useEffect(() => {
    if (!currentUser || !counterOfTradeId) return;
    fetchMyTrades()
      .then((all) => setOriginalTrade(all.find((t) => t.id === counterOfTradeId) ?? null))
      .catch(() => {});
  }, [currentUser, counterOfTradeId]);

  useEffect(() => {
    if (!currentUser) return;
    fetchGameState()
      .then((state) => { setMyOwned(tally(state.ownedCardIds)); setMyDiamonds(state.diamonds); })
      .catch(() => {});
    getUserCardsForTrade(currentUser.id).then((r) => setMyAvailable(toQuantities(r.cards))).catch(() => {});
  }, [currentUser]);

  useEffect(() => {
    if (!currentUser || selectedUser || !wantedCardId || !cardById(wantedCardId)) return;
    findTradersForCard(wantedCardId).then((r) => setHolders(r.traders)).catch(() => setHolders([]));
  }, [currentUser, selectedUser, wantedCardId]);

  useEffect(() => {
    if (!selectedUser) return;
    getPlayerProfile(selectedUser.id)
      .then((profile) => {
        setTheirOwned(tally(profile.ownedCardIds));
        setTheirAvailable(toQuantities(profile.cardsForTrade));
        // Hitta byte opens the builder with the Card already requested.
        if (wantedCardId && profile.ownedCardIds.includes(wantedCardId)) {
          setRequested((prev) => (Object.keys(prev).length === 0 ? { [wantedCardId]: 1 } : prev));
        }
      })
      .catch(() => {});
  }, [selectedUser, wantedCardId]);

  useEffect(() => {
    if (query.length < 2) { setSearchResults([]); return; }
    const timer = setTimeout(() => {
      setIsSearching(true);
      searchUsers(query).then(setSearchResults).catch(() => {}).finally(() => setIsSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Picker entries. "Du ger": all my Copies, my Available Copies of Cards they
  // are missing first. "Du får": everything they own, since any Copy may be asked for.
  const giveEntries: PickerEntry[] = useMemo(
    () =>
      Object.entries(myOwned).map(([cardId, max]) => ({
        cardId,
        max,
        recipientOwned: theirOwned[cardId] ?? 0,
        available: myAvailable[cardId] ?? 0,
        suggested: (myAvailable[cardId] ?? 0) > 0 && !(theirOwned[cardId] > 0),
      })),
    [myOwned, myAvailable, theirOwned],
  );
  const getEntries: PickerEntry[] = useMemo(
    () =>
      Object.entries(theirOwned).map(([cardId, max]) => ({
        cardId,
        max,
        recipientOwned: myOwned[cardId] ?? 0,
        available: theirAvailable[cardId] ?? 0,
      })),
    [theirOwned, theirAvailable, myOwned],
  );
  const suggestions = giveEntries.filter((e) => e.suggested);

  function adjust(setter: React.Dispatch<React.SetStateAction<Counts>>, cardId: string, next: number, max: number) {
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
    const terms = {
      offeredCardIds: expand(offered),
      offeredDiamonds,
      requestedCardIds: expand(requested),
      requestedDiamonds,
    };
    try {
      if (counterOfTradeId) await counterTrade(counterOfTradeId, terms);
      else await createTrade({ receiverUserId: selectedUser.id, ...terms });
      navigate("/byte?flik=mina");
    } catch (e) {
      setError(e instanceof Error ? e.message : counterOfTradeId ? "Kunde inte skicka motbudet." : "Kunde inte skapa bytet.");
    } finally {
      setIsSubmitting(false);
    }
  }

  function chooseUser(u: UserSearchResult) {
    setSelectedUser(u);
    setSearchResults([]);
    setQuery("");
  }

  if (!currentUser) {
    return (
      <main className="py-16 bg-raised min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-surface border rounded-xl p-10">
            <h1 className="text-3xl font-bold mb-4">Nytt byte</h1>
            <p className="text-text mb-6">Logga in för att handla.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  const offeredTotal = Object.values(offered).reduce((s, n) => s + n, 0);
  const requestedTotal = Object.values(requested).reduce((s, n) => s + n, 0);
  const canSubmit =
    !isSubmitting && selectedUser !== null &&
    (offeredTotal > 0 || offeredDiamonds > 0) && (requestedTotal > 0 || requestedDiamonds > 0);

  const sideText = (counts: Counts, diamonds: number) => {
    const parts = [formatRarityTotals(rarityTotalsOf(counts))].filter(Boolean);
    if (diamonds > 0) parts.push(`${diamonds} ◆`);
    return parts.length > 0 ? parts.join(" + ") : "Inget";
  };

  return (
    <main className="bg-raised min-h-[calc(100vh-72px)] pt-8">
      <div className="container mx-auto px-4">
        <div className="max-w-3xl lg:max-w-[1400px] mx-auto space-y-6 pb-8">
          <div>
            <h1 className="text-3xl font-bold mb-1">{isCounter ? "Motbud" : "Nytt byte"}</h1>
            <p className="text-text text-sm">
              {isCounter
                ? "Bygg ditt motbud. Det ursprungliga erbjudandet stängs när du skickar."
                : "Välj vad du får och vad du ger. Ingen gräns, inga avgifter."}
            </p>
          </div>

          {isCounter && originalTrade && (
            <section className="rounded-2xl border border-hairline-strong bg-surface p-4 text-sm">
              <h2 className="font-semibold mb-2">Du svarar på {originalTrade.sender.username}s erbjudande</h2>
              <p><span className="text-secondary">De erbjöd:</span> {describeSide(originalTrade.offeredCardIds, originalTrade.offeredDiamonds)}</p>
              <p><span className="text-secondary">De ville ha:</span> {describeSide(originalTrade.requestedCardIds, originalTrade.requestedDiamonds)}</p>
            </section>
          )}

          <section className="rounded-2xl border bg-surface p-4">
            <h2 className="text-sm font-semibold mb-2">{isCounter ? "Motpart" : "Spelare"}</h2>
            {selectedUser ? (
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium flex-1">{selectedUser.username}</span>
                {!isCounter && (
                  <Button
                    size="sm" variant="outline"
                    onClick={() => { setSelectedUser(null); setTheirOwned({}); setTheirAvailable({}); setRequested({}); }}
                  >
                    Byt spelare
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {wantedCardId && cardById(wantedCardId) && (
                  <div>
                    <p className="text-sm text-secondary mb-2">
                      Vem vill du byta till dig <span className="font-medium text-text">{cardById(wantedCardId)!.name}</span> av?
                    </p>
                    {holders === null ? (
                      <p className="text-xs text-tertiary">Söker...</p>
                    ) : holders.length === 0 ? (
                      <p className="text-xs text-tertiary">Ingen har kortet tillgängligt för byte just nu. Du kan fortfarande söka efter en spelare nedan.</p>
                    ) : (
                      <ul className="divide-y rounded-md border">
                        {holders.map((h) => (
                          <li key={h.userId}>
                            <button
                              className="flex w-full items-center justify-between px-4 py-2 text-left text-sm hover:bg-raised"
                              onClick={() => chooseUser({ id: h.userId, username: h.username })}
                            >
                              <span>{h.username}</span>
                              <span className="text-xs text-tertiary">×{h.quantity} tillgängliga</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <div className="space-y-2 max-w-sm">
                  <input
                    type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sök användarnamn..."
                    className="w-full h-10 rounded-md border border-hairline bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
                  />
                  {isSearching && <p className="text-xs text-tertiary">Söker...</p>}
                  {searchResults.length > 0 && (
                    <div className="rounded-md border divide-y">
                      {searchResults.map((u) => (
                        <button key={u.id} className="w-full text-left px-4 py-2 text-sm hover:bg-raised" onClick={() => chooseUser(u)}>
                          {u.username}
                        </button>
                      ))}
                    </div>
                  )}
                  {!isSearching && query.length >= 2 && searchResults.length === 0 && (
                    <p className="text-xs text-tertiary">Inga spelare hittades.</p>
                  )}
                </div>
              </div>
            )}
          </section>

          {selectedUser && (
            // Phone: stacked. Desktop (layout C, "Instrument"): their Cards | the Trade | your Duplicates, all open.
            <div className="space-y-6 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(340px,420px)_minmax(0,1fr)] lg:items-start lg:gap-6 lg:space-y-0">
              <section className="hidden lg:flex lg:h-[calc(100vh-14rem)] lg:min-h-[480px] flex-col overflow-hidden rounded-2xl border bg-surface">
                <h2 className="px-4 pt-4 text-lg font-semibold">{selectedUser.username}s kort</h2>
                <TradePickerList
                  entries={getEntries}
                  selected={requested}
                  onAdjust={(id, n, max) => adjust(setRequested, id, n, max)}
                  emptyMessage={`${selectedUser.username} har inga kort.`}
                  flagUnavailable
                  gridClassName="grid-cols-2 xl:grid-cols-3"
                  controlsClassName="px-4 pt-2"
                />
              </section>
              <div className="space-y-6 lg:sticky lg:top-4">
              <SideSection
                title="Du får"
                counts={requested}
                recipientOwned={myOwned}
                available={theirAvailable}
                flagUnavailable
                onAdd={() => setSheet("get")}
                onAdjust={(id, n) => adjust(setRequested, id, n, theirOwned[id] ?? 0)}
                diamondLabel="Diamanter du får"
                diamonds={requestedDiamonds}
                onDiamonds={setRequestedDiamonds}
              />
              <SideSection
                title="Du ger"
                counts={offered}
                recipientOwned={theirOwned}
                available={myAvailable}
                onAdd={() => setSheet("give")}
                onAdjust={(id, n) => adjust(setOffered, id, n, myOwned[id] ?? 0)}
                diamondLabel={`Diamanter du ger (du har ${myDiamonds})`}
                diamonds={offeredDiamonds}
                diamondMax={myDiamonds}
                onDiamonds={setOfferedDiamonds}
                suggestions={suggestions.filter((s) => !offered[s.cardId])}
                onSuggest={(id) => adjust(setOffered, id, 1, myOwned[id] ?? 0)}
              />
              {error && <p className="text-sm text-danger">{error}</p>}
              {/* Desktop: the summary lives in the middle column instead of the sticky bar. */}
              <div className="hidden lg:block rounded-2xl border bg-surface p-4 space-y-3">
                <p className="text-sm font-medium" aria-live="polite">
                  {sideText(requested, requestedDiamonds)} <span className="text-tertiary">⇄</span> {sideText(offered, offeredDiamonds)}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => navigate("/byte")}>Avbryt</Button>
                  <Button disabled={!canSubmit} onClick={() => void handleSubmit()} className="flex-1 bg-accent text-accent-on hover:bg-accent/90">
                    {isSubmitting ? "Skickar..." : isCounter ? "Skicka motbud" : "Skicka förslag"}
                  </Button>
                </div>
              </div>
              </div>
              <section className="hidden lg:flex lg:h-[calc(100vh-14rem)] lg:min-h-[480px] flex-col overflow-hidden rounded-2xl border bg-surface">
                <h2 className="px-4 pt-4 text-lg font-semibold">Dina kort</h2>
                <TradePickerList
                  entries={giveEntries}
                  selected={offered}
                  onAdjust={(id, n, max) => adjust(setOffered, id, n, max)}
                  emptyMessage="Du har inga kort."
                  gridClassName="grid-cols-2 xl:grid-cols-3"
                  controlsClassName="px-4 pt-2"
                />
              </section>
            </div>
          )}
        </div>
      </div>

      {selectedUser && (
        <div className="sticky bottom-[calc(3.5rem+env(safe-area-inset-bottom))] lg:hidden z-40 border-t bg-surface">
          <div className="container mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
            <p className="min-w-0 flex-1 text-sm font-medium" aria-live="polite">
              {sideText(requested, requestedDiamonds)} <span className="text-tertiary">⇄</span> {sideText(offered, offeredDiamonds)}
            </p>
            <Button variant="outline" size="sm" onClick={() => navigate("/byte")}>Avbryt</Button>
            <Button disabled={!canSubmit} onClick={() => void handleSubmit()} className="bg-accent text-accent-on hover:bg-accent/90">
              {isSubmitting ? "Skickar..." : isCounter ? "Skicka motbud" : "Skicka förslag"}
            </Button>
          </div>
        </div>
      )}

      {sheet === "get" && selectedUser && (
        <TradePickerSheet
          title={`Du får av ${selectedUser.username}`}
          entries={getEntries}
          selected={requested}
          onAdjust={(id, n, max) => adjust(setRequested, id, n, max)}
          onClose={() => setSheet(null)}
          emptyMessage={`${selectedUser.username} har inga kort.`}
          flagUnavailable
        />
      )}
      {sheet === "give" && (
        <TradePickerSheet
          title="Du ger"
          entries={giveEntries}
          selected={offered}
          onAdjust={(id, n, max) => adjust(setOffered, id, n, max)}
          onClose={() => setSheet(null)}
          emptyMessage="Du har inga kort."
        />
      )}
    </main>
  );
}

function SideSection({
  title, counts, recipientOwned, available, flagUnavailable = false, onAdd, onAdjust,
  diamondLabel, diamonds, diamondMax, onDiamonds, suggestions = [], onSuggest,
}: {
  title: string;
  counts: Counts;
  /** Copies the player receiving this side holds, for Ny! / Har redan. */
  recipientOwned: Counts;
  /** Copies the giver of this side has Available for Trade. */
  available: Counts;
  flagUnavailable?: boolean;
  onAdd: () => void;
  onAdjust: (cardId: string, next: number) => void;
  diamondLabel: string;
  diamonds: number;
  diamondMax?: number;
  onDiamonds: (n: number) => void;
  suggestions?: PickerEntry[];
  onSuggest?: (cardId: string) => void;
}) {
  return (
    <section className="rounded-2xl border bg-surface p-4 space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {Object.entries(counts).map(([cardId, qty]) => {
          const card = cardById(cardId);
          if (!card) return null;
          const owned = recipientOwned[cardId] ?? 0;
          const notForTrade = flagUnavailable && qty > (available[cardId] ?? 0);
          return (
            <div key={cardId} className="flex flex-col gap-1">
              <CardThumb card={card} copies={1} />
              <span className={`text-center text-[10px] font-medium ${owned === 0 ? "text-success" : "text-secondary"}`}>{copyStatusLabel(owned)}</span>
              {notForTrade && <span className="text-center text-[10px] font-medium text-danger">Inte till byte</span>}
              <div className="flex items-center justify-center gap-1.5">
                <button type="button" onClick={() => onAdjust(cardId, qty - 1)} className="h-7 w-7 rounded-full border border-hairline-strong text-sm leading-none" aria-label={`Ta bort ${card.name}`}>−</button>
                <span className="w-6 text-center text-xs font-medium tabular-nums">×{qty}</span>
                <button type="button" onClick={() => onAdjust(cardId, qty + 1)} className="h-7 w-7 rounded-full border border-hairline-strong text-sm leading-none" aria-label={`Lägg till ${card.name}`}>+</button>
              </div>
            </div>
          );
        })}
        <button
          type="button" onClick={onAdd} aria-label={`Lägg till kort: ${title}`}
          className="lg:hidden flex aspect-[4/5] w-full items-center justify-center rounded-[10px] border-2 border-dashed border-hairline-strong text-3xl text-secondary hover:text-text"
        >
          +
        </button>
      </div>

      {suggestions.length > 0 && onSuggest && (
        <div>
          <p className="text-xs text-secondary mb-1">Förslag: dina tillgängliga kort som de saknar</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {suggestions.map((s) => (
              <div key={s.cardId} className="w-16 shrink-0">
                <CardThumb card={cardById(s.cardId)!} copies={1} onSelect={() => onSuggest(s.cardId)} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <label className="text-xs text-secondary mb-1 block">{diamondLabel}</label>
        <input
          type="number" min={0} max={diamondMax} value={diamonds}
          onChange={(e) => {
            const n = Math.max(0, Math.floor(Number(e.target.value)) || 0);
            onDiamonds(diamondMax !== undefined ? Math.min(diamondMax, n) : n);
          }}
          className="w-32 h-9 rounded-md border border-hairline bg-surface px-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />
      </div>
    </section>
  );
}
