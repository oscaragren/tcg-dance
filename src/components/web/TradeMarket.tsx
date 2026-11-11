import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import { CardPlaceholder } from "./CardPlaceholder";
import { cardById, cards, rarityOrder } from "../../data/cards";
import type { DanceCard } from "../../types/danceCard";
import type { MarketTrader, MarketTraderForCard } from "../../types/game";
import { fetchGameState, fetchMarketTraders, findTradersForCard } from "../../utils/gameApi";

type Tab = "card" | "browse";

function newTradeLink(userId: string, username: string) {
  return `/byte/ny?anvandare=${userId}&namn=${encodeURIComponent(username)}`;
}

/**
 * The one visual language for "you don't own this yet" across the market: a
 * small red dot on a player, and on the card itself, who offers something new
 * to you. Explained by <UnownedLegend /> wherever it is used.
 */
export function UnownedDot({ label }: { label: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      role="img"
      className="inline-block w-2.5 h-2.5 rounded-full bg-accent shrink-0"
    />
  );
}

export function UnownedLegend() {
  return (
    <p className="flex items-center gap-2 text-xs text-secondary">
      <UnownedDot label="Röd prick" />
      <span>
        Röd prick betyder att spelaren vill byta bort minst ett kort som du
        <span className="font-medium text-text"> inte äger ännu</span> — de korten har
        en liten röd prick.
      </span>
    </p>
  );
}

/**
 * The Bytesmarknad itself, without any page chrome, so it can be rendered both
 * as a tab on /byte and as its own page on /byte/marknad.
 */
export function TradeMarket({ initialCardId }: { initialCardId?: string } = {}) {
  const [tab, setTab] = useState<Tab>("card");
  const [ownedCardIds, setOwnedCardIds] = useState<Set<string>>(() => new Set());

  // Which cards the viewer already has — everything red on this page is derived
  // from this set.
  useEffect(() => {
    let cancelled = false;
    fetchGameState()
      .then((state) => { if (!cancelled) setOwnedCardIds(new Set(state.ownedCardIds)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 border-b">
        {([
          ["card", "Sök efter kort"],
          ["browse", "Bläddra bland spelare"],
        ] as [Tab, string][]).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-accent text-text"
                : "border-transparent text-secondary hover:text-text"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <UnownedLegend />

      {tab === "card"
        ? <CardSearchTab ownedCardIds={ownedCardIds} initialCardId={initialCardId} />
        : <BrowseTradersTab ownedCardIds={ownedCardIds} />}
    </div>
  );
}

/** Search the card catalog by name, then see who has that card up for trade. */
function CardSearchTab({ ownedCardIds, initialCardId }: { ownedCardIds: Set<string>; initialCardId?: string }) {
  const initialCard = initialCardId ? cardById(initialCardId) ?? null : null;
  const [query, setQuery] = useState(initialCard?.name ?? "");
  const [selectedCard, setSelectedCard] = useState<DanceCard | null>(initialCard);
  const [traders, setTraders] = useState<MarketTraderForCard[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Match on couple name, dance style or club, so "bugg" surfaces every bugg
  // card and not just the ones with "bugg" in the name.
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    return cards
      .filter((c) =>
        c.name.toLowerCase().includes(q) ||
        (c.danceStyle ?? "").toLowerCase().includes(q) ||
        (c.club ?? "").toLowerCase().includes(q),
      )
      .sort((a, b) => rarityOrder[a.rarity] - rarityOrder[b.rarity] || a.name.localeCompare(b.name, "sv"))
      .slice(0, 20);
  }, [query]);

  useEffect(() => {
    if (!selectedCard) { setTraders(null); return; }
    setIsLoading(true);
    setError(null);
    findTradersForCard(selectedCard.id)
      .then((res) => setTraders(res.traders))
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte söka efter kortet."))
      .finally(() => setIsLoading(false));
  }, [selectedCard]);

  const isMissing = selectedCard ? !ownedCardIds.has(selectedCard.id) : false;

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-surface p-6">
        <label htmlFor="card-search" className="block text-sm text-text mb-2">
          Sök efter ett kort — på namn, dansstil eller förening
        </label>
        <input
          id="card-search"
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedCard(null); }}
          placeholder="Namn, dansstil eller förening..."
          className="w-full max-w-sm h-10 rounded-md border border-hairline bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
        />

        {!selectedCard && suggestions.length > 0 && (
          <div className="mt-3 max-w-sm rounded-md border divide-y max-h-72 overflow-y-auto">
            {suggestions.map((card) => (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-raised transition-colors flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="truncate flex items-center gap-2">
                    {!ownedCardIds.has(card.id) && <UnownedDot label="Du äger inte det här kortet" />}
                    <span className="truncate">{card.name}</span>
                  </span>
                  {(card.danceStyle || card.club) && (
                    <span className="block text-[11px] text-tertiary truncate">
                      {[card.danceStyle, card.club].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-tertiary shrink-0">{card.rarity}</span>
              </button>
            ))}
          </div>
        )}

        {!selectedCard && query.trim().length >= 2 && suggestions.length === 0 && (
          <p className="mt-3 text-xs text-tertiary">Inga kort matchar sökningen.</p>
        )}
      </section>

      {selectedCard && (
        <section className="rounded-2xl border bg-surface p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="shrink-0">
              <div className="relative inline-block">
                <CardPlaceholder
                  rarity={selectedCard.rarity}
                  size="small"
                  name={selectedCard.name}
                  danceStyle={selectedCard.danceStyle}
                  event={selectedCard.event}
                  designKey={selectedCard.designKey}
                  hideDesign
                  lockedLabel={isMissing ? "Saknas" : "Dold"}
                  showCaption
                />
                {isMissing && (
                  <div className="absolute top-1.5 left-1.5 z-10 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-background pointer-events-none" />
                )}
              </div>
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                {isMissing && <UnownedDot label="Du äger inte det här kortet" />}
                {selectedCard.name}
              </h2>
              <p className="text-sm text-secondary mb-4">
                {isMissing
                  ? "Du saknar det här kortet. Spelarna nedan vill byta bort det."
                  : "Du äger redan det här kortet. Spelarna nedan vill byta bort det."}
              </p>

              {error && <p className="text-sm text-danger">{error}</p>}

              {isLoading ? (
                <p className="text-sm text-secondary">Söker...</p>
              ) : !traders || traders.length === 0 ? (
                <p className="text-sm text-tertiary">Ingen spelare vill byta bort det här kortet just nu.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {traders.map((t) => (
                    <li key={t.userId} className="flex items-center gap-3 px-4 py-3">
                      {isMissing && <UnownedDot label="Erbjuder ett kort du saknar" />}
                      <Link
                        to={`/spelare/${t.userId}`}
                        className="flex-1 min-w-0 truncate text-sm font-medium text-text hover:text-accent transition-colors"
                      >
                        {t.username}
                      </Link>
                      <span className="text-xs text-tertiary shrink-0">×{t.quantity}</span>
                      <Button asChild size="sm" className="bg-accent hover:bg-accent text-accent-on shrink-0">
                        <Link to={newTradeLink(t.userId, t.username)}>Byt</Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

/** Scroll through every player who has something up for trade. */
function BrowseTradersTab({ ownedCardIds }: { ownedCardIds: Set<string> }) {
  const [traders, setTraders] = useState<MarketTrader[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    fetchMarketTraders()
      .then((res) => setTraders(res.traders))
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda marknaden."))
      .finally(() => setIsLoading(false));
  }, []);

  // Distinct cards this player offers that the viewer is missing. Drives both
  // the red dot on the row and the red ring on the individual cards.
  const missingByTrader = useMemo(() => {
    const map = new Map<string, number>();
    for (const trader of traders) {
      map.set(trader.userId, trader.cards.filter((c) => !ownedCardIds.has(c.cardId)).length);
    }
    return map;
  }, [traders, ownedCardIds]);

  if (isLoading) return <p className="text-sm text-secondary">Laddar marknaden...</p>;
  if (error) return <p className="text-sm text-danger">{error}</p>;

  if (traders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline-strong bg-surface p-8 text-center text-secondary">
        Ingen spelare vill byta bort några kort ännu.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {traders.map((trader) => {
        const isOpen = expanded === trader.userId;
        const missing = missingByTrader.get(trader.userId) ?? 0;
        return (
          <section key={trader.userId} className="rounded-2xl border bg-surface overflow-hidden">
            <div className="flex items-center gap-3 p-5">
              <button
                onClick={() => setExpanded(isOpen ? null : trader.userId)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="font-semibold truncate flex items-center gap-2">
                  {missing > 0 && (
                    <UnownedDot
                      label={`${missing} kort du inte äger`}
                    />
                  )}
                  <span className="truncate">{trader.username}</span>
                </div>
                <div className="text-xs text-secondary">
                  Vill byta bort {trader.totalCards} kort
                  {missing > 0 && (
                    <span className="text-danger font-medium">
                      {" "}· {missing} du saknar
                    </span>
                  )}
                  {" "}· {isOpen ? "dölj" : "visa"}
                </div>
              </button>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to={`/spelare/${trader.userId}`}>Samling</Link>
              </Button>
              <Button asChild size="sm" className="bg-accent hover:bg-accent text-accent-on shrink-0">
                <Link to={newTradeLink(trader.userId, trader.username)}>Byt</Link>
              </Button>
            </div>

            {isOpen && (
              <div className="border-t px-5 py-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {trader.cards.map(({ cardId, quantity }) => {
                    const card = cardById(cardId);
                    if (!card) return null;
                    const isMissing = !ownedCardIds.has(cardId);
                    return (
                      <div key={cardId} className="relative flex justify-center">
                        <div className="relative">
                          <CardPlaceholder
                            rarity={card.rarity}
                            size="small"
                            name={card.name}
                            designKey={card.designKey}
                            showCaption
                          />
                          {quantity > 1 && (
                            <div className="absolute top-1.5 right-1.5 z-10 bg-black/70 text-text text-[10px] font-bold rounded px-1.5 py-0.5 leading-none pointer-events-none">
                              ×{quantity}
                            </div>
                          )}
                          {isMissing && (
                            <div className="absolute top-1.5 left-1.5 z-10 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-background pointer-events-none" />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
