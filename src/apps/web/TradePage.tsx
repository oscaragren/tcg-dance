import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cardById } from "../../data/cards";
import type { AuthUser } from "../../types/auth";
import type { Trade } from "../../types/game";
import { acceptTrade, cancelTrade, fetchMyTrades, rejectTrade } from "../../utils/gameApi";

type Tab = "incoming" | "outgoing" | "history";

type TradePageProps = { currentUser: AuthUser | null };

export function TradePage({ currentUser }: TradePageProps) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [tab, setTab] = useState<Tab>("incoming");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) { setIsLoading(false); return; }
    fetchMyTrades()
      .then(setTrades)
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda byten."))
      .finally(() => setIsLoading(false));
  }, [currentUser]);

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
