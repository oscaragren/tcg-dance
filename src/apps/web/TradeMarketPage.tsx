import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cardById, cards, rarityOrder } from "../../data/cards";
import type { AuthUser } from "../../types/auth";
import type { DanceCard } from "../../types/danceCard";
import type { MarketTrader, MarketTraderForCard } from "../../types/game";
import { fetchMarketTraders, findTradersForCard } from "../../utils/gameApi";

type Tab = "card" | "browse";

type TradeMarketPageProps = { currentUser: AuthUser | null };

function newTradeLink(userId: string, username: string) {
  return `/byte/ny?anvandare=${userId}&namn=${encodeURIComponent(username)}`;
}

export function TradeMarketPage({ currentUser }: TradeMarketPageProps) {
  const [tab, setTab] = useState<Tab>("card");

  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Bytesmarknad</h1>
            <p className="text-gray-600 mb-6">Logga in för att se vilka kort andra spelare erbjuder.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto space-y-8">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Bytesmarknad</h1>
              <p className="text-gray-600">Hitta ett kort du saknar, eller bläddra bland allas byteshyllor.</p>
            </div>
            <Button asChild variant="outline">
              <Link to="/byte">Tillbaka till Byte</Link>
            </Button>
          </div>

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
                    ? "border-purple-600 text-purple-600"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "card" ? <CardSearchTab /> : <BrowseTradersTab />}
        </div>
      </div>
    </main>
  );
}

/** Search the card catalog by name, then see who has that card up for trade. */
function CardSearchTab() {
  const [query, setQuery] = useState("");
  const [selectedCard, setSelectedCard] = useState<DanceCard | null>(null);
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

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-white p-6">
        <label htmlFor="card-search" className="block text-sm text-gray-600 mb-2">
          Sök efter ett kort — på namn, dansstil eller förening
        </label>
        <input
          id="card-search"
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setSelectedCard(null); }}
          placeholder="Namn, dansstil eller förening..."
          className="w-full max-w-sm h-10 rounded-md border border-gray-200 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
        />

        {!selectedCard && suggestions.length > 0 && (
          <div className="mt-3 max-w-sm rounded-md border divide-y max-h-72 overflow-y-auto">
            {suggestions.map((card) => (
              <button
                key={card.id}
                onClick={() => setSelectedCard(card)}
                className="w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between gap-3"
              >
                <span className="min-w-0">
                  <span className="truncate block">{card.name}</span>
                  {(card.danceStyle || card.club) && (
                    <span className="block text-[11px] text-gray-400 truncate">
                      {[card.danceStyle, card.club].filter(Boolean).join(" · ")}
                    </span>
                  )}
                </span>
                <span className="text-[11px] uppercase tracking-wider text-gray-400 shrink-0">{card.rarity}</span>
              </button>
            ))}
          </div>
        )}

        {!selectedCard && query.trim().length >= 2 && suggestions.length === 0 && (
          <p className="mt-3 text-xs text-gray-400">Inga kort matchar sökningen.</p>
        )}
      </section>

      {selectedCard && (
        <section className="rounded-2xl border bg-white p-6">
          <div className="flex flex-col sm:flex-row gap-6">
            <div className="shrink-0">
              <CardPlaceholder
                rarity={selectedCard.rarity}
                size="small"
                name={selectedCard.name}
                danceStyle={selectedCard.danceStyle}
                designKey={selectedCard.designKey}
                showCaption
              />
            </div>

            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-semibold">{selectedCard.name}</h2>
              <p className="text-sm text-gray-500 mb-4">Spelare som erbjuder det här kortet.</p>

              {error && <p className="text-sm text-red-600">{error}</p>}

              {isLoading ? (
                <p className="text-sm text-gray-500">Söker...</p>
              ) : !traders || traders.length === 0 ? (
                <p className="text-sm text-gray-400">Ingen spelare har markerat det här kortet för byte just nu.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {traders.map((t) => (
                    <li key={t.userId} className="flex items-center gap-3 px-4 py-3">
                      <Link
                        to={`/spelare/${t.userId}`}
                        className="flex-1 min-w-0 truncate text-sm font-medium text-gray-900 hover:text-purple-600 transition-colors"
                      >
                        {t.username}
                      </Link>
                      <span className="text-xs text-gray-400 shrink-0">×{t.quantity}</span>
                      <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-700 text-white shrink-0">
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
function BrowseTradersTab() {
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

  if (isLoading) return <p className="text-sm text-gray-500">Laddar marknaden...</p>;
  if (error) return <p className="text-sm text-red-600">{error}</p>;

  if (traders.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
        Ingen spelare har markerat kort för byte ännu.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {traders.map((trader) => {
        const isOpen = expanded === trader.userId;
        return (
          <section key={trader.userId} className="rounded-2xl border bg-white overflow-hidden">
            <div className="flex items-center gap-3 p-5">
              <button
                onClick={() => setExpanded(isOpen ? null : trader.userId)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="font-semibold truncate">{trader.username}</div>
                <div className="text-xs text-gray-500">
                  {trader.totalCards} {trader.totalCards === 1 ? "kort" : "kort"} för byte ·{" "}
                  {isOpen ? "dölj" : "visa"}
                </div>
              </button>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to={`/spelare/${trader.userId}`}>Samling</Link>
              </Button>
              <Button asChild size="sm" className="bg-purple-600 hover:bg-purple-700 text-white shrink-0">
                <Link to={newTradeLink(trader.userId, trader.username)}>Byt</Link>
              </Button>
            </div>

            {isOpen && (
              <div className="border-t px-5 py-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                  {trader.cards.map(({ cardId, quantity }) => {
                    const card = cardById(cardId);
                    if (!card) return null;
                    return (
                      <div key={cardId} className="relative flex justify-center">
                        <CardPlaceholder
                          rarity={card.rarity}
                          size="small"
                          name={card.name}
                          designKey={card.designKey}
                          showCaption
                        />
                        {quantity > 1 && (
                          <div className="absolute top-1.5 right-1.5 z-10 bg-black/70 text-white text-[10px] font-bold rounded px-1.5 py-0.5 leading-none pointer-events-none">
                            ×{quantity}
                          </div>
                        )}
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
