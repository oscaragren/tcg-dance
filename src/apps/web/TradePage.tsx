import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cardById, cards } from "../../data/cards";
import type { DanceCard } from "../../data/cards";
import type { AuthUser } from "../../types/auth";
import type { Trade, UserSearchResult } from "../../types/game";
import { acceptTrade, cancelTrade, fetchMyTrades, rejectTrade, searchCardTraders } from "../../utils/gameApi";

type Tab = "incoming" | "outgoing" | "history";

type TradePageProps = { currentUser: AuthUser | null };

export function TradePage({ currentUser }: TradePageProps) {
  const navigate = useNavigate();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tab, setTab] = useState<Tab>("incoming");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Card search
  const [cardQuery, setCardQuery] = useState("");
  const [suggestions, setSuggestions] = useState<DanceCard[]>([]);
  const [selectedCard, setSelectedCard] = useState<DanceCard | null>(null);
  const [traders, setTraders] = useState<UserSearchResult[]>([]);
  const [isSearchingTraders, setIsSearchingTraders] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!currentUser) { setIsLoading(false); return; }
    fetchMyTrades()
      .then(setTrades)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda byten."))
      .finally(() => setIsLoading(false));
  }, [currentUser]);

  // Filter card suggestions from local catalog
  useEffect(() => {
    const q = cardQuery.trim().toLowerCase();
    if (q.length < 2) { setSuggestions([]); setShowSuggestions(false); return; }
    const matches = cards.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 8);
    setSuggestions(matches);
    setShowSuggestions(matches.length > 0);
  }, [cardQuery]);

  // When a card is selected, find who has it for trade
  useEffect(() => {
    if (!selectedCard || !currentUser) return;
    setIsSearchingTraders(true);
    setTraders([]);
    searchCardTraders(selectedCard.id)
      .then(setTraders)
      .catch(() => {})
      .finally(() => setIsSearchingTraders(false));
  }, [selectedCard, currentUser]);

  // Close suggestions on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function selectCard(card: DanceCard) {
    setSelectedCard(card);
    setCardQuery(card.name);
    setShowSuggestions(false);
  }

  function clearCardSearch() {
    setSelectedCard(null);
    setCardQuery("");
    setSuggestions([]);
    setTraders([]);
  }

  async function handleAccept(tradeId: string) {
    setActionLoading(tradeId); setError(null);
    try {
      await acceptTrade(tradeId);
      setTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, status: "accepted" as const } : t));
    } catch (e) { setError(e instanceof Error ? e.message : "Kunde inte acceptera bytet."); }
    finally { setActionLoading(null); }
  }

  async function handleReject(tradeId: string) {
    setActionLoading(tradeId); setError(null);
    try {
      await rejectTrade(tradeId);
      setTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, status: "rejected" as const } : t));
    } catch (e) { setError(e instanceof Error ? e.message : "Kunde inte avböja bytet."); }
    finally { setActionLoading(null); }
  }

  async function handleCancel(tradeId: string) {
    setActionLoading(tradeId); setError(null);
    try {
      await cancelTrade(tradeId);
      setTrades((prev) => prev.map((t) => t.id === tradeId ? { ...t, status: "cancelled" as const } : t));
    } catch (e) { setError(e instanceof Error ? e.message : "Kunde inte avbryta bytet."); }
    finally { setActionLoading(null); }
  }

  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Byte</h1>
            <p className="text-gray-600 mb-6">Logga in för att byta kort med andra spelare.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  const myId = currentUser.id;
  const incoming = trades.filter((t) => t.receiver.id === myId && t.status === "pending");
  const outgoing = trades.filter((t) => t.sender.id === myId && t.status === "pending");
  const history  = trades.filter((t) => t.status !== "pending");
  const tabTrades = tab === "incoming" ? incoming : tab === "outgoing" ? outgoing : history;

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Byte</h1>
              <p className="text-gray-600">Byt kort med andra spelare.</p>
            </div>
            <Button asChild className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
              <Link to="/byte/ny">Nytt byte</Link>
            </Button>
          </div>

          {/* Card search */}
          <section className="rounded-2xl border bg-white p-6">
            <h2 className="text-lg font-semibold mb-1">Sök efter ett kort</h2>
            <p className="text-sm text-gray-500 mb-4">
              Hitta vilka spelare som har ett visst kort tillgängligt för byte.
            </p>

            <div ref={searchRef} className="relative max-w-sm">
              <input
                type="text"
                value={cardQuery}
                onChange={(e) => { setCardQuery(e.target.value); setSelectedCard(null); setTraders([]); }}
                onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
                placeholder="Sök kortnamn..."
                className="w-full h-10 rounded-md border border-gray-200 bg-white px-3 pr-8 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
              />
              {cardQuery && (
                <button
                  onClick={clearCardSearch}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                >
                  ×
                </button>
              )}

              {showSuggestions && (
                <div className="absolute top-full left-0 right-0 mt-1 rounded-md border bg-white shadow-lg z-20 divide-y max-h-64 overflow-y-auto">
                  {suggestions.map((card) => (
                    <button
                      key={card.id}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                      onMouseDown={(e) => { e.preventDefault(); selectCard(card); }}
                    >
                      <span className={`text-[10px] font-medium uppercase w-16 shrink-0 ${
                        card.rarity === "legendary" ? "text-amber-600" :
                        card.rarity === "epic"      ? "text-purple-600" :
                        card.rarity === "rare"      ? "text-blue-600"   : "text-gray-400"
                      }`}>{card.rarity}</span>
                      <span className="flex-1 min-w-0">{card.name}</span>
                      {card.danceStyle && (
                        <span className="text-[10px] text-gray-400 shrink-0">{card.danceStyle}</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Results */}
            {selectedCard && (
              <div className="mt-5">
                <div className="flex items-center gap-4 mb-4">
                  <div style={{ width: 56 }}>
                    <CardPlaceholder
                      rarity={selectedCard.rarity}
                      size="small"
                      name={selectedCard.name}
                      designKey={selectedCard.designKey}
                      showCaption={false}
                    />
                  </div>
                  <div>
                    <div className="font-semibold">{selectedCard.name}</div>
                    <div className={`text-xs uppercase tracking-wide ${
                      selectedCard.rarity === "legendary" ? "text-amber-600" :
                      selectedCard.rarity === "epic"      ? "text-purple-600" :
                      selectedCard.rarity === "rare"      ? "text-blue-600"   : "text-gray-400"
                    }`}>{selectedCard.rarity}</div>
                    {selectedCard.danceStyle && (
                      <div className="text-xs text-gray-400 mt-0.5">{selectedCard.danceStyle}</div>
                    )}
                  </div>
                </div>

                {isSearchingTraders ? (
                  <p className="text-sm text-gray-400">Söker...</p>
                ) : traders.length === 0 ? (
                  <p className="text-sm text-gray-500">
                    Ingen spelare har det här kortet tillgängligt för byte just nu.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500 mb-2">
                      {traders.length} spelare {traders.length === 1 ? "har" : "har"} det tillgängligt:
                    </p>
                    {traders.map((user) => (
                      <div key={user.id} className="flex items-center justify-between rounded-lg border px-4 py-2">
                        <span className="text-sm font-medium">{user.username}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/byte/ny?anvandare=${user.id}&namn=${encodeURIComponent(user.username)}`)}
                        >
                          Starta byte
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* Tabs */}
          <div>
            <div className="flex gap-1 mb-6 border-b">
              {([
                ["incoming", `Inkommande (${incoming.length})`],
                ["outgoing", `Utgående (${outgoing.length})`],
                ["history",  "Historik"],
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

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            {isLoading ? (
              <p className="text-gray-500">Laddar...</p>
            ) : tabTrades.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-gray-500">
                {tab === "incoming" ? "Inga inkommande bytesförfrågningar."
                  : tab === "outgoing" ? "Inga utgående bytesförfrågningar."
                  : "Ingen historik ännu."}
              </div>
            ) : (
              <div className="space-y-4">
                {tabTrades.map((trade) => (
                  <TradeCard
                    key={trade.id}
                    trade={trade}
                    myId={myId}
                    actionLoading={actionLoading}
                    onAccept={handleAccept}
                    onReject={handleReject}
                    onCancel={handleCancel}
                  />
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </main>
  );
}

const STATUS_LABEL: Record<Trade["status"], string> = {
  pending: "", accepted: "Accepterat", rejected: "Avböjt", cancelled: "Avbrutet",
};

function TradeCard({ trade, myId, actionLoading, onAccept, onReject, onCancel }: {
  trade: Trade; myId: string; actionLoading: string | null;
  onAccept: (id: string) => void; onReject: (id: string) => void; onCancel: (id: string) => void;
}) {
  const isIncoming = trade.receiver.id === myId;
  const isActing   = actionLoading === trade.id;
  const otherUser  = isIncoming ? trade.sender : trade.receiver;

  return (
    <div className="rounded-xl border bg-white p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-gray-500">
          {isIncoming ? `Från ${otherUser.username}` : `Till ${otherUser.username}`}
          <span className="ml-2 text-xs text-gray-400">{new Date(trade.createdAt).toLocaleDateString("sv-SE")}</span>
        </span>
        {trade.status !== "pending" && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${trade.status === "accepted" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {STATUS_LABEL[trade.status]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_32px_1fr] gap-4 items-start">
        <TradeSide
          cardIds={isIncoming ? trade.offeredCardIds  : trade.requestedCardIds}
          diamonds={isIncoming ? trade.offeredDiamonds : trade.requestedDiamonds}
          label={isIncoming ? `${otherUser.username} erbjuder` : "Du begär"}
        />
        <div className="text-xl text-gray-300 text-center pt-6 hidden md:block">⇄</div>
        <TradeSide
          cardIds={isIncoming ? trade.requestedCardIds : trade.offeredCardIds}
          diamonds={isIncoming ? trade.requestedDiamonds : trade.offeredDiamonds}
          label={isIncoming ? "Du ger" : "Du erbjuder"}
        />
      </div>

      {trade.status === "pending" && (
        <div className="flex gap-2 mt-4 justify-end">
          {isIncoming ? (
            <>
              <Button size="sm" variant="outline" disabled={isActing} onClick={() => onReject(trade.id)}>Avböj</Button>
              <Button size="sm" disabled={isActing} className="bg-green-600 hover:bg-green-700 text-white" onClick={() => onAccept(trade.id)}>
                {isActing ? "Accepterar..." : "Acceptera"}
              </Button>
            </>
          ) : (
            <Button size="sm" variant="outline" disabled={isActing} onClick={() => onCancel(trade.id)}>
              {isActing ? "Avbryter..." : "Avbryt"}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function TradeSide({ cardIds, diamonds, label }: { cardIds: string[]; diamonds: number; label: string }) {
  return (
    <div>
      <div className="text-xs font-medium text-gray-500 mb-2">{label}</div>
      {cardIds.length === 0 && diamonds === 0 ? (
        <p className="text-xs text-gray-400">Inget</p>
      ) : (
        <div className="space-y-2">
          {cardIds.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {cardIds.map((cardId) => {
                const card = cardById(cardId);
                return card ? (
                  <div key={cardId} style={{ width: 64 }}>
                    <CardPlaceholder rarity={card.rarity} size="small" name={card.name} designKey={card.designKey} showCaption />
                  </div>
                ) : (
                  <div key={cardId} className="w-16 h-20 bg-gray-100 rounded text-[10px] text-gray-400 flex items-center justify-center px-1 text-center">
                    {cardId}
                  </div>
                );
              })}
            </div>
          )}
          {diamonds > 0 && <div className="text-sm font-semibold text-blue-600">{diamonds} diamanter</div>}
        </div>
      )}
    </div>
  );
}
