import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/shared/ui/button";
import { cardById } from "../../data/cards";
import {
  adminLogin,
  adminLogout,
  adminMe,
  deleteAdminUser,
  fetchAdminOverview,
  fetchAdminPool,
  fetchAdminTradePairs,
  fetchAdminTrades,
  fetchAdminUserCards,
  fetchAdminUsers,
  type AdminOverview,
  type AdminPoolEntry,
  type AdminTrade,
  type AdminTradeFlag,
  type AdminTradePair,
  type AdminUser,
  type AdminUserCards,
} from "../../utils/adminApi";

const RARITY_ORDER = ["special", "legendary", "epic", "rare", "common"];

function cardName(cardId: string): string {
  return cardById(cardId)?.name ?? cardId;
}

const FLAG_LABELS: Record<AdminTradeFlag, string> = {
  gift: "Gåva",
  lopsided: "Ojämnt",
  very_lopsided: "Mycket ojämnt",
  exclusive_pair: "Slutet par",
};

const FLAG_STYLES: Record<AdminTradeFlag, string> = {
  gift: "bg-red-100 text-red-700",
  lopsided: "bg-amber-100 text-amber-700",
  very_lopsided: "bg-red-100 text-red-700",
  exclusive_pair: "bg-purple-100 text-purple-700",
};

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("sv-SE");
}

/** "Kort A, Kort B +2 till · 50 ◆" — a whole trade side in one cell. */
function formatSide(cardIds: string[], diamonds: number): string {
  const names = cardIds.map(cardName);
  const shown = names.slice(0, 2).join(", ");
  const rest = names.length > 2 ? " +" + String(names.length - 2) + " till" : "";
  const cards = names.length > 0 ? shown + rest : "";
  const gems = diamonds > 0 ? String(diamonds) + " \u25c6" : "";
  return [cards, gems].filter(Boolean).join(" \u00b7 ") || "\u2014";
}

/** Signup gap in whatever unit reads most naturally at that distance. */
function formatSignupGap(minutes: number | null): string {
  if (minutes === null) return "\u2014";
  if (minutes < 60) return String(minutes) + " min";
  if (minutes < 60 * 48) return String(Math.round(minutes / 60)) + " h";
  return String(Math.round(minutes / (60 * 24))) + " dagar";
}

function FlagBadges({ flags }: { flags: AdminTradeFlag[] }) {
  if (flags.length === 0) return <span className="text-gray-300">{"\u2014"}</span>;
  return (
    <span className="flex flex-wrap gap-1 justify-end">
      {flags.map((f) => (
        <span key={f} className={"rounded px-1.5 py-0.5 text-[11px] font-medium " + FLAG_STYLES[f]}>
          {FLAG_LABELS[f]}
        </span>
      ))}
    </span>
  );
}

export function AdminPage() {
  const [checking, setChecking] = useState(true);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    adminMe()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false))
      .finally(() => setChecking(false));
  }, []);

  if (checking) {
    return <main className="min-h-[calc(100vh-72px)] bg-gray-50" />;
  }

  if (!authed) {
    return <AdminLogin onSuccess={() => setAuthed(true)} />;
  }

  return <AdminDashboard onLogout={() => setAuthed(false)} />;
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await adminLogin(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde inte logga in.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <form onSubmit={handleSubmit} className="max-w-sm mx-auto bg-white border rounded-xl p-8 space-y-4">
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-gray-500">Ange admin-lösenordet för att fortsätta.</p>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Lösenord"
            autoFocus
            className="w-full h-10 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting || !password} className="w-full bg-purple-600 hover:bg-purple-700 text-white">
            {submitting ? "Loggar in..." : "Logga in"}
          </Button>
        </form>
      </div>
    </main>
  );
}

function AdminDashboard({ onLogout }: { onLogout: () => void }) {
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [pool, setPool] = useState<AdminPoolEntry[]>([]);
  const [trades, setTrades] = useState<AdminTrade[]>([]);
  const [tradePairs, setTradePairs] = useState<AdminTradePair[]>([]);
  const [onlyFlaggedTrades, setOnlyFlaggedTrades] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserCards | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    Promise.all([
      fetchAdminOverview(), fetchAdminUsers(), fetchAdminPool(),
      fetchAdminTrades(), fetchAdminTradePairs(),
    ])
      .then(([o, u, p, t, tp]) => {
        setOverview(o); setUsers(u); setPool(p); setTrades(t); setTradePairs(tp);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda admin-data."));
  }, []);

  async function handleLogout() {
    try { await adminLogout(); } catch { /* ignore */ }
    onLogout();
  }

  async function openUser(userId: string) {
    setLoadingUser(true);
    try {
      setSelectedUser(await fetchAdminUserCards(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ladda användarens samling.");
    } finally {
      setLoadingUser(false);
    }
  }

  async function confirmDeleteUser() {
    if (!userToDelete) return;
    setDeleting(true);
    try {
      await deleteAdminUser(userToDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      setOverview((prev) => (prev ? { ...prev, userCount: prev.userCount - 1 } : prev));
      if (selectedUser?.user.id === userToDelete.id) setSelectedUser(null);
      setUserToDelete(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte radera användaren.");
    } finally {
      setDeleting(false);
    }
  }

  const visibleTrades = useMemo(
    () => (onlyFlaggedTrades ? trades.filter((t) => t.flags.length > 0) : trades),
    [trades, onlyFlaggedTrades],
  );

  const flaggedTradeCount = useMemo(() => trades.filter((t) => t.flags.length > 0).length, [trades]);

  const poolSorted = useMemo(
    () => [...pool].sort((a, b) => b.bought - a.bought || cardName(a.cardId).localeCompare(cardName(b.cardId), "sv")),
    [pool],
  );

  return (
    <main className="py-12 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto space-y-10">

          <div className="flex items-center justify-between">
            <h1 className="text-3xl md:text-4xl font-bold">Admin</h1>
            <Button variant="outline" onClick={handleLogout}>Logga ut</Button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Overview */}
          {overview && (
            <section className="space-y-4">
              <h2 className="text-lg font-semibold">Översikt</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Spelare" value={overview.userCount} />
                <StatCard label="Kort sålda totalt" value={overview.pool.totalBought} />
                <StatCard label="Kort kvar i poolen" value={overview.pool.totalRemaining} />
                <StatCard label="Kort ägda (alla kopior)" value={overview.totalOwnedCards} />
              </div>
              <div className="rounded-xl border bg-white overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2">Raritet</th>
                      <th className="text-right px-4 py-2">Sålda</th>
                      <th className="text-right px-4 py-2">Kvar</th>
                      <th className="text-right px-4 py-2">Totalt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {RARITY_ORDER.filter((r) => overview.pool.byRarity[r]).map((r) => {
                      const s = overview.pool.byRarity[r];
                      return (
                        <tr key={r}>
                          <td className="px-4 py-2 capitalize">{r}</td>
                          <td className="px-4 py-2 text-right">{s.bought}</td>
                          <td className="px-4 py-2 text-right">{s.remaining}</td>
                          <td className="px-4 py-2 text-right text-gray-500">{s.total}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Users */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Spelare ({users.length})</h2>
            <div className="rounded-xl border bg-white overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500">
                  <tr>
                    <th className="text-left px-4 py-2">Användarnamn</th>
                    <th className="text-left px-4 py-2">Namn</th>
                    <th className="text-left px-4 py-2">E-post</th>
                    <th className="text-right px-4 py-2">◆</th>
                    <th className="text-right px-4 py-2">Unika</th>
                    <th className="text-right px-4 py-2">Totalt</th>
                    <th className="px-4 py-2"></th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-2 font-medium">{u.username}</td>
                      <td className="px-4 py-2">
                        {u.firstName && u.lastName
                          ? u.firstName + " " + u.lastName
                          : <span className="text-amber-600 text-xs">Saknas</span>}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{u.email}</td>
                      <td className="px-4 py-2 text-right">{u.diamonds}</td>
                      <td className="px-4 py-2 text-right">{u.uniqueCards}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{u.totalCards}</td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => void openUser(u.id)}
                          className="text-purple-600 hover:text-purple-800 text-xs font-medium underline"
                        >
                          Visa samling
                        </button>
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => setUserToDelete(u)}
                          className="text-red-600 hover:text-red-800 text-xs font-medium underline"
                        >
                          Radera
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Suspicious trading pairs */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Byteskonton att titta på ({tradePairs.length})</h2>
              <p className="text-sm text-gray-500 mt-1">
                Par som har genomfört minst ett byte, sorterade efter hur mycket de
                liknar en person som handlar med sig själv. Inget här är ett bevis —
                <span className="font-medium"> Endast varandra</span> betyder att inget av
                kontona någonsin har bytt med någon annan.
              </p>
            </div>
            {tradePairs.length === 0 ? (
              <p className="text-sm text-gray-500 rounded-xl border bg-white p-4">Inga genomförda byten än.</p>
            ) : (
              <div className="rounded-xl border bg-white overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500">
                    <tr>
                      <th className="text-left px-4 py-2">Spelare</th>
                      <th className="text-right px-4 py-2">Byten</th>
                      <th className="text-right px-4 py-2">Ojämna</th>
                      <th className="text-right px-4 py-2" title="Andel av det minst aktiva kontots byten som sker med den här partnern">
                        Koncentration
                      </th>
                      <th className="text-right px-4 py-2" title="Antal olika motparter respektive konto har bytt med">
                        Motparter
                      </th>
                      <th className="text-right px-4 py-2" title="Nettovärde som flyttats till den ena spelaren">
                        Nettoflöde
                      </th>
                      <th className="text-right px-4 py-2" title="Tid mellan de två kontonas registrering">
                        Reg. isär
                      </th>
                      <th className="text-right px-4 py-2">Flaggor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {tradePairs.map((pair) => {
                      const winner = pair.netValueToA >= 0 ? pair.userA : pair.userB;
                      const netAbs = Math.abs(pair.netValueToA);
                      return (
                        <tr key={pair.key} className={pair.exclusive ? "bg-purple-50/50" : undefined}>
                          <td className="px-4 py-2">
                            <div className="font-medium">
                              {pair.userA.username} {"\u2194"} {pair.userB.username}
                            </div>
                            <div className="text-xs text-gray-500">
                              {pair.userA.email} {"\u00b7"} {pair.userB.email}
                            </div>
                          </td>
                          <td className="px-4 py-2 text-right">{pair.tradeCount}</td>
                          <td className="px-4 py-2 text-right">
                            {pair.lopsidedCount > 0
                              ? <span className="text-amber-700 font-medium">{pair.lopsidedCount}</span>
                              : <span className="text-gray-400">0</span>}
                          </td>
                          <td className="px-4 py-2 text-right">{pair.concentration}%</td>
                          <td className="px-4 py-2 text-right text-gray-500">
                            {pair.partnersA} / {pair.partnersB}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {netAbs === 0
                              ? <span className="text-gray-400">jämnt</span>
                              : <span title={"Netto till " + winner.username}>
                                  {"\u2192"} {winner.username} +{netAbs}
                                </span>}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-500">
                            {formatSignupGap(pair.signupGapMinutes)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            <span className="flex flex-wrap gap-1 justify-end">
                              {pair.exclusive && (
                                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-purple-100 text-purple-700">
                                  Endast varandra
                                </span>
                              )}
                              {pair.registeredTogether && (
                                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-amber-100 text-amber-700">
                                  Samtidig reg.
                                </span>
                              )}
                              {!pair.exclusive && !pair.registeredTogether && (
                                <span className="text-gray-300">{"\u2014"}</span>
                              )}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* All trades */}
          <section className="space-y-4">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">
                  Byten ({trades.length}, varav {flaggedTradeCount} flaggade)
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Varje sida värderas efter spelets egen uppgraderingsstege
                  (20 common = 1 rare, 15 rare = 1 epic, 10 epic = 1 legendary).
                  Ett byte flaggas när ena sidan är minst 3 gånger mer värd än den andra.
                </p>
              </div>
              <Button variant="outline" onClick={() => setOnlyFlaggedTrades((v) => !v)}>
                {onlyFlaggedTrades ? "Visa alla" : "Visa bara flaggade"}
              </Button>
            </div>
            {visibleTrades.length === 0 ? (
              <p className="text-sm text-gray-500 rounded-xl border bg-white p-4">
                {onlyFlaggedTrades ? "Inga flaggade byten." : "Inga byten än."}
              </p>
            ) : (
              <div className="rounded-xl border bg-white overflow-x-auto max-h-[560px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-2">Datum</th>
                      <th className="text-left px-4 py-2">Från {"\u2192"} Till</th>
                      <th className="text-left px-4 py-2">Avsändaren ger</th>
                      <th className="text-left px-4 py-2">Mottagaren ger</th>
                      <th className="text-right px-4 py-2">Värde</th>
                      <th className="text-right px-4 py-2" title="Större sidan delat med mindre sidan">Kvot</th>
                      <th className="text-left px-4 py-2">Status</th>
                      <th className="text-right px-4 py-2">Flaggor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {visibleTrades.map((t) => (
                      <tr key={t.id} className={t.flags.length > 0 ? "bg-amber-50/40" : undefined}>
                        <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                        <td className="px-4 py-2 whitespace-nowrap">
                          <span className={t.favours === "sender" ? "font-semibold" : undefined}>
                            {t.sender.username}
                          </span>
                          {" \u2192 "}
                          <span className={t.favours === "receiver" ? "font-semibold" : undefined}>
                            {t.receiver.username}
                          </span>
                        </td>
                        <td className="px-4 py-2">{formatSide(t.offeredCardIds, t.offeredDiamonds)}</td>
                        <td className="px-4 py-2">{formatSide(t.requestedCardIds, t.requestedDiamonds)}</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap text-gray-500">
                          {t.senderValue} / {t.receiverValue}
                        </td>
                        <td className="px-4 py-2 text-right font-medium">
                          {t.ratio === null ? "\u221e" : t.ratio + "x"}
                        </td>
                        <td className="px-4 py-2 capitalize text-gray-500">{t.status}</td>
                        <td className="px-4 py-2 text-right"><FlagBadges flags={t.flags} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Card pool */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold">Kort — sålda vs. kvar</h2>
            <div className="rounded-xl border bg-white overflow-x-auto max-h-[480px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2">Kort</th>
                    <th className="text-left px-4 py-2">Raritet</th>
                    <th className="text-right px-4 py-2">Sålda</th>
                    <th className="text-right px-4 py-2">Kvar</th>
                    <th className="text-right px-4 py-2">Totalt</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {poolSorted.map((p) => (
                    <tr key={p.cardId}>
                      <td className="px-4 py-2">{cardName(p.cardId)}</td>
                      <td className="px-4 py-2 capitalize text-gray-500">{p.rarity}</td>
                      <td className="px-4 py-2 text-right">{p.bought}</td>
                      <td className="px-4 py-2 text-right">{p.remaining}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{p.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </div>

      {/* User collection modal */}
      {(selectedUser || loadingUser) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b flex items-center justify-between">
              <h3 className="font-semibold">
                {loadingUser ? "Laddar..." : `${selectedUser?.user.username} — samling`}
              </h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5 overflow-y-auto">
              {selectedUser && selectedUser.cards.length === 0 && (
                <p className="text-sm text-gray-500">Inga kort.</p>
              )}
              {selectedUser && selectedUser.cards.length > 0 && (
                <ul className="text-sm divide-y">
                  {[...selectedUser.cards]
                    .sort((a, b) => cardName(a.cardId).localeCompare(cardName(b.cardId), "sv"))
                    .map((c) => (
                      <li key={c.cardId} className="flex justify-between py-1.5">
                        <span>{cardName(c.cardId)}</span>
                        <span className="text-gray-500">×{c.count}</span>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete-user confirmation */}
      {userToDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => (deleting ? null : setUserToDelete(null))}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-lg">Radera {userToDelete.username}?</h3>
            <p className="text-sm text-gray-500">
              Kontot, alla kort, kistor och pågående byten raderas permanent. Detta kan inte ångras.
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setUserToDelete(null)} disabled={deleting}>
                Avbryt
              </Button>
              <Button
                onClick={() => void confirmDeleteUser()}
                disabled={deleting}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                {deleting ? "Raderar..." : "Radera"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
    </div>
  );
}
