import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { CardThumb } from "../../components/web/CardThumb";
import { MatchningarTab } from "../../components/web/MatchningarTab";
import { cardById } from "../../data/cards";
import type { AuthUser } from "../../types/auth";
import type { RarityTotals, Trade, TradeCopy, UserSearchResult } from "../../types/game";
import { acceptTrade, cancelTrade, fetchMyTrades, rejectTrade, searchUsers } from "../../utils/gameApi";
import { copyStatusLabel, formatRarityTotals } from "../../utils/tradeSummary";

type Section = "matchningar" | "mina" | "sok";

type TradePageProps = { currentUser: AuthUser | null };

export function TradePage({ currentUser }: TradePageProps) {
  const navigate = useNavigate();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [searchParams] = useSearchParams();
  const initialSection = searchParams.get("flik");
  const [section, setSection] = useState<Section>(
    initialSection === "sok" || initialSection === "mina" ? initialSection : "matchningar",
  );
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

  // Countering reuses the full offer builder rather than a cut-down inline form:
  // a counter is an ordinary proposal and has to clear the same validation, and
  // that page already knows how to show the other player's collection with their
  // "vill byta" cards first.
  function handleCounter(trade: Trade) {
    const params = new URLSearchParams({
      anvandare: trade.sender.id,
      namn: trade.sender.username,
      motbud: trade.id,
    });
    navigate(`/byte/ny?${params.toString()}`);
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
      <main className="py-16 bg-raised min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-surface border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Byte</h1>
            <p className="text-text mb-6">Logga in för att byta kort med andra spelare.</p>
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

  return (
    <main className="py-16 bg-raised min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl lg:max-w-6xl mx-auto space-y-8">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Byte</h1>
              <p className="text-text">Byt kort med andra spelare. Matchningar visar vilka som har kort du saknar.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild className="bg-accent text-accent-on hover:bg-accent/90 hover:">
                <Link to="/byte?flik=sok">Nytt byte</Link>
              </Button>
            </div>
          </div>

          <div className="flex gap-1 border-b">
            {([
              ["matchningar", "Matchningar"],
              ["mina", `Mina byten${incoming.length ? ` (${incoming.length})` : ""}`],
              ["sok", "Sök spelare"],
            ] as [Section, string][]).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setSection(id)}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
                  section === id ? "border-accent text-text" : "border-transparent text-secondary hover:text-text"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {section === "matchningar" && <MatchningarTab />}

          {section === "sok" && <PlayerSearch />}

          {section === "mina" && (
            <div className="space-y-8">
              {error && <p className="text-sm text-danger">{error}</p>}
              {isLoading ? (
                <p className="text-secondary">Laddar...</p>
              ) : (
                <>
                  {([
                    ["Inkommande", incoming, "Inga inkommande förslag."],
                    ["Utgående", outgoing, "Inga utgående förslag."],
                    ["Historik", history, "Ingen historik ännu."],
                  ] as [string, Trade[], string][]).map(([label, list, empty]) => (
                    <section key={label} className="space-y-3">
                      <h2 className="text-lg font-semibold">{label} ({list.length})</h2>
                      {list.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-hairline-strong bg-surface p-6 text-center text-sm text-secondary">{empty}</div>
                      ) : (
                        list.map((trade) => (
                          <TradeCard
                            key={trade.id}
                            trade={trade}
                            myId={myId}
                            actionLoading={actionLoading}
                            onAccept={handleAccept}
                            onReject={handleReject}
                            onCancel={handleCancel}
                            onCounter={handleCounter}
                          />
                        ))
                      )}
                    </section>
                  ))}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </main>
  );
}

const STATUS_LABEL: Record<Trade["status"], string> = {
  pending: "", accepted: "Accepterat", rejected: "Avböjt", cancelled: "Avbrutet",
  countered: "Motbud lämnat",
};

function TradeCard({ trade, myId, actionLoading, onAccept, onReject, onCancel, onCounter }: {
  trade: Trade; myId: string; actionLoading: string | null;
  onAccept: (id: string) => void; onReject: (id: string) => void; onCancel: (id: string) => void;
  onCounter: (trade: Trade) => void;
}) {
  const isIncoming = trade.receiver.id === myId;
  const isActing   = actionLoading === trade.id;
  const otherUser  = isIncoming ? trade.sender : trade.receiver;

  return (
    <div className="rounded-xl border bg-surface p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-secondary">
          {isIncoming ? `Från ${otherUser.username}` : `Till ${otherUser.username}`}
          <span className="ml-2 text-xs text-tertiary">{new Date(trade.createdAt).toLocaleDateString("sv-SE")}</span>
        </span>
        {trade.status !== "pending" && (
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${trade.status === "accepted" ? "bg-success/15 text-success" : "bg-raised text-secondary"}`}>
            {STATUS_LABEL[trade.status]}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_32px_1fr] gap-4 items-start">
        {/* Always the side coming to you, so Ny! / Har redan reads from your side. */}
        <TradeSide
          copies={isIncoming ? trade.offeredCopies : trade.requestedCopies}
          rarity={isIncoming ? trade.offeredRarity : trade.requestedRarity}
          diamonds={isIncoming ? trade.offeredDiamonds : trade.requestedDiamonds}
          label={`Du får av ${otherUser.username}`}
        />
        <div className="text-xl text-tertiary text-center pt-6 hidden md:block">⇄</div>
        <TradeSide
          copies={isIncoming ? trade.requestedCopies : trade.offeredCopies}
          rarity={isIncoming ? trade.requestedRarity : trade.offeredRarity}
          diamonds={isIncoming ? trade.requestedDiamonds : trade.offeredDiamonds}
          label="Du ger"
          showStatus={false}
        />
      </div>

      {trade.status === "pending" && (
        <div className="flex gap-2 mt-4 justify-end">
          {isIncoming ? (
            <>
              <Button size="sm" variant="outline" disabled={isActing} onClick={() => onReject(trade.id)}>Avböj</Button>
              <Button size="sm" variant="outline" disabled={isActing} onClick={() => onCounter(trade)}>Motbjud</Button>
              <Button size="sm" disabled={isActing} className="bg-success hover:bg-success text-accent-on" onClick={() => onAccept(trade.id)}>
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

function TradeSide({ copies, rarity, diamonds, label, showStatus = true }: {
  copies: TradeCopy[];
  rarity: RarityTotals;
  diamonds: number;
  label: string;
  /** Ny! / Har redan describe what lands with you, so only the receiving side shows them. */
  showStatus?: boolean;
}) {
  return (
    <div>
      <div className="text-xs font-medium text-secondary mb-1">{label}</div>
      {copies.length === 0 && diamonds === 0 ? (
        <p className="text-xs text-tertiary">Inget</p>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-semibold">
            {[copies.length > 0 ? formatRarityTotals(rarity) : null, diamonds > 0 ? `${diamonds} ◆` : null].filter(Boolean).join(" + ")}
          </div>
          {copies.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {copies.map((copy, index) => {
                const card = cardById(copy.cardId);
                return (
                  // The same Card can appear twice in one Trade, so the index is part of the key.
                  <div key={`${copy.cardId}-${index}`} className="w-16">
                    {card ? (
                      <CardThumb card={card} copies={1} />
                    ) : (
                      <div className="aspect-[4/5] rounded bg-raised text-[10px] text-tertiary flex items-center justify-center px-1 text-center">{copy.cardId}</div>
                    )}
                    {showStatus && (
                      <span className={`mt-0.5 block text-center text-[10px] font-medium ${copy.isNew ? "text-success" : "text-secondary"}`}>
                        {copyStatusLabel(copy.recipientOwned)}
                      </span>
                    )}
                    {copy.notForTrade && <span className="block text-center text-[10px] font-medium text-danger">Inte till byte</span>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Sök spelare: find a player by name and open the Trade builder with them. */
function PlayerSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);

  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const timer = setTimeout(() => { searchUsers(query).then(setResults).catch(() => {}); }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  return (
    <div className="space-y-3 max-w-sm">
      <input
        type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Sök användarnamn..."
        className="w-full h-10 rounded-md border border-hairline bg-surface px-3 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
      />
      {results.length > 0 && (
        <ul className="divide-y rounded-md border bg-surface">
          {results.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <Link to={`/spelare/${u.id}`} className="flex-1 truncate font-medium hover:text-accent">{u.username}</Link>
              <Button asChild size="sm" className="bg-accent text-accent-on hover:bg-accent">
                <Link to={`/byte/ny?anvandare=${u.id}&namn=${encodeURIComponent(u.username)}`}>Föreslå byte</Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {query.length >= 2 && results.length === 0 && <p className="text-xs text-tertiary">Inga spelare hittades.</p>}
    </div>
  );
}
