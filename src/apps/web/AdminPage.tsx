import { AlertTriangle, Layers, Megaphone, Repeat, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/shared/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../components/shared/ui/tabs";
import { CardPlaceholder } from "../../components/web/CardPlaceholder";
import { cardById, rarityOrder } from "../../data/cards";
import {
  adminLogin,
  adminLogout,
  adminMe,
  createAdminAnnouncement,
  deleteAdminAnnouncement,
  deleteAdminUser,
  fetchAdminAnnouncements,
  fetchAdminOverview,
  fetchAdminPool,
  fetchAdminTradePairs,
  fetchAdminTrades,
  fetchAdminUserDetail,
  fetchAdminUsers,
  type AdminAnnouncement,
  type AdminOverview,
  type AdminPoolEntry,
  type AdminTrade,
  type AdminTradeFlag,
  type AdminTradePair,
  type AdminUser,
  type AdminUserDetail,
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
  const gems = diamonds > 0 ? String(diamonds) + " ◆" : "";
  return [cards, gems].filter(Boolean).join(" · ") || "—";
}

/** Signup gap in whatever unit reads most naturally at that distance. */
function formatSignupGap(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return String(minutes) + " min";
  if (minutes < 60 * 48) return String(Math.round(minutes / 60)) + " h";
  return String(Math.round(minutes / (60 * 24))) + " dagar";
}

function FlagBadges({ flags }: { flags: AdminTradeFlag[] }) {
  if (flags.length === 0) return <span className="text-gray-300">{"—"}</span>;
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

/** Small labeled search box, reused across the tabs that list many rows. */
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
      />
    </div>
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
  const [announcements, setAnnouncements] = useState<AdminAnnouncement[]>([]);
  const [onlyFlaggedTrades, setOnlyFlaggedTrades] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserDetail | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [newAnnouncementTitle, setNewAnnouncementTitle] = useState("");
  const [newAnnouncementBody, setNewAnnouncementBody] = useState("");
  const [publishingAnnouncement, setPublishingAnnouncement] = useState(false);
  const [announcementError, setAnnouncementError] = useState<string | null>(null);
  const [deletingAnnouncementId, setDeletingAnnouncementId] = useState<string | null>(null);
  const [playerQuery, setPlayerQuery] = useState("");
  const [tradeQuery, setTradeQuery] = useState("");
  const [pairQuery, setPairQuery] = useState("");
  const [poolQuery, setPoolQuery] = useState("");

  useEffect(() => {
    Promise.all([
      fetchAdminOverview(), fetchAdminUsers(), fetchAdminPool(),
      fetchAdminTrades(), fetchAdminTradePairs(), fetchAdminAnnouncements(),
    ])
      .then(([o, u, p, t, tp, a]) => {
        setOverview(o); setUsers(u); setPool(p); setTrades(t); setTradePairs(tp); setAnnouncements(a);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda admin-data."));
  }, []);

  async function handlePublishAnnouncement(e: React.FormEvent) {
    e.preventDefault();
    const title = newAnnouncementTitle.trim();
    const body = newAnnouncementBody.trim();
    if (!title || !body) return;

    setPublishingAnnouncement(true);
    setAnnouncementError(null);
    try {
      const created = await createAdminAnnouncement(title, body);
      setAnnouncements((prev) => [created, ...prev]);
      setNewAnnouncementTitle("");
      setNewAnnouncementBody("");
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : "Kunde inte publicera meddelandet.");
    } finally {
      setPublishingAnnouncement(false);
    }
  }

  async function handleDeleteAnnouncement(id: string) {
    setDeletingAnnouncementId(id);
    try {
      await deleteAdminAnnouncement(id);
      setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setAnnouncementError(err instanceof Error ? err.message : "Kunde inte radera meddelandet.");
    } finally {
      setDeletingAnnouncementId(null);
    }
  }

  async function handleLogout() {
    try { await adminLogout(); } catch { /* ignore */ }
    onLogout();
  }

  async function openUser(userId: string) {
    setLoadingUser(true);
    try {
      setSelectedUser(await fetchAdminUserDetail(userId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ladda användaren.");
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

  const filteredUsers = useMemo(() => {
    const q = playerQuery.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.firstName ?? "").toLowerCase().includes(q) ||
      (u.lastName ?? "").toLowerCase().includes(q),
    );
  }, [users, playerQuery]);

  const flaggedTradeCount = useMemo(() => trades.filter((t) => t.flags.length > 0).length, [trades]);

  const visibleTrades = useMemo(() => {
    let list = onlyFlaggedTrades ? trades.filter((t) => t.flags.length > 0) : trades;
    const q = tradeQuery.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (t) => t.sender.username.toLowerCase().includes(q) || t.receiver.username.toLowerCase().includes(q),
      );
    }
    return list;
  }, [trades, onlyFlaggedTrades, tradeQuery]);

  const visibleTradePairs = useMemo(() => {
    const q = pairQuery.trim().toLowerCase();
    if (!q) return tradePairs;
    return tradePairs.filter(
      (p) => p.userA.username.toLowerCase().includes(q) || p.userB.username.toLowerCase().includes(q),
    );
  }, [tradePairs, pairQuery]);

  const poolSorted = useMemo(
    () => [...pool].sort((a, b) => b.bought - a.bought || cardName(a.cardId).localeCompare(cardName(b.cardId), "sv")),
    [pool],
  );

  const visiblePool = useMemo(() => {
    const q = poolQuery.trim().toLowerCase();
    if (!q) return poolSorted;
    return poolSorted.filter((p) => cardName(p.cardId).toLowerCase().includes(q));
  }, [poolSorted, poolQuery]);

  return (
    <main className="py-8 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-6xl mx-auto space-y-6">

          <div className="flex items-center justify-between">
            <h1 className="text-2xl md:text-3xl font-bold">Admin</h1>
            <Button variant="outline" onClick={handleLogout}>Logga ut</Button>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {/* Overview — always visible, one glance at the state of things */}
          {overview && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard label="Spelare" value={overview.userCount} />
              <StatCard label="Kort sålda totalt" value={overview.pool.totalBought} />
              <StatCard label="Kort kvar i poolen" value={overview.pool.totalRemaining} />
              <StatCard label="Kort ägda (alla kopior)" value={overview.totalOwnedCards} />
            </div>
          )}

          <Tabs defaultValue="players">
            <div className="-mx-6 overflow-x-auto px-6 sm:mx-0 sm:px-0">
              <TabsList className="h-auto w-max flex-nowrap gap-1 sm:w-fit">
                <TabsTrigger value="players" className="gap-1.5">
                  <Users className="w-3.5 h-3.5" /> Spelare
                  <span className="text-gray-400">({users.length})</span>
                </TabsTrigger>
                <TabsTrigger value="trades" className="gap-1.5">
                  <Repeat className="w-3.5 h-3.5" /> Byten
                  <span className="text-gray-400">({trades.length})</span>
                  {flaggedTradeCount > 0 && (
                    <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                      {flaggedTradeCount}
                    </span>
                  )}
                </TabsTrigger>
                <TabsTrigger value="pairs" className="gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Byteskonton
                  <span className="text-gray-400">({tradePairs.length})</span>
                </TabsTrigger>
                <TabsTrigger value="announcements" className="gap-1.5">
                  <Megaphone className="w-3.5 h-3.5" /> Meddelanden
                  <span className="text-gray-400">({announcements.length})</span>
                </TabsTrigger>
                <TabsTrigger value="pool" className="gap-1.5">
                  <Layers className="w-3.5 h-3.5" /> Kortpool
                </TabsTrigger>
              </TabsList>
            </div>

            {/* Players */}
            <TabsContent value="players" className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <SearchBox value={playerQuery} onChange={setPlayerQuery} placeholder="Sök på användarnamn, namn eller e-post..." />
                {playerQuery && (
                  <p className="text-xs text-gray-500">Visar {filteredUsers.length} av {users.length}</p>
                )}
              </div>
              <div className="rounded-xl border bg-white overflow-x-auto max-h-[600px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-500 sticky top-0">
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
                    {filteredUsers.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          Inga spelare matchar sökningen.
                        </td>
                      </tr>
                    ) : (
                      filteredUsers.map((u) => (
                        <tr
                          key={u.id}
                          onClick={() => void openUser(u.id)}
                          className="cursor-pointer hover:bg-gray-50 transition-colors"
                        >
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
                              onClick={(e) => { e.stopPropagation(); void openUser(u.id); }}
                              className="text-purple-600 hover:text-purple-800 text-xs font-medium underline"
                            >
                              Visa
                            </button>
                          </td>
                          <td className="px-4 py-2 text-right">
                            <button
                              onClick={(e) => { e.stopPropagation(); setUserToDelete(u); }}
                              className="text-red-600 hover:text-red-800 text-xs font-medium underline"
                            >
                              Radera
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </TabsContent>

            {/* Trades */}
            <TabsContent value="trades" className="space-y-3 pt-2">
              <p className="text-sm text-gray-500">
                Varje sida värderas efter spelets egen uppgraderingsstege
                (20 common = 1 rare, 15 rare = 1 epic, 10 epic = 1 legendary).
                Ett byte flaggas när ena sidan är minst 3 gånger mer värd än den andra.
              </p>
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <SearchBox value={tradeQuery} onChange={setTradeQuery} placeholder="Sök på spelare..." />
                <Button variant="outline" onClick={() => setOnlyFlaggedTrades((v) => !v)} className="shrink-0">
                  {onlyFlaggedTrades ? "Visa alla" : "Visa bara flaggade"}
                </Button>
                <p className="text-xs text-gray-500">
                  Visar {visibleTrades.length} av {trades.length} ({flaggedTradeCount} flaggade totalt)
                </p>
              </div>
              {visibleTrades.length === 0 ? (
                <p className="text-sm text-gray-500 rounded-xl border bg-white p-4">
                  Inga byten matchar filtren.
                </p>
              ) : (
                <div className="rounded-xl border bg-white overflow-x-auto max-h-[560px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 text-gray-500 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-2">Datum</th>
                        <th className="text-left px-4 py-2">Från {"→"} Till</th>
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
                            {" → "}
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
                            {t.ratio === null ? "∞" : t.ratio + "x"}
                          </td>
                          <td className="px-4 py-2 capitalize text-gray-500">{t.status}</td>
                          <td className="px-4 py-2 text-right"><FlagBadges flags={t.flags} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>

            {/* Suspicious trading pairs */}
            <TabsContent value="pairs" className="space-y-3 pt-2">
              <p className="text-sm text-gray-500">
                Par som har genomfört minst ett byte, sorterade efter hur mycket de
                liknar en person som handlar med sig själv. Inget här är ett bevis —
                <span className="font-medium"> Endast varandra</span> betyder att inget av
                kontona någonsin har bytt med någon annan.
              </p>
              <SearchBox value={pairQuery} onChange={setPairQuery} placeholder="Sök på spelare..." />
              {visibleTradePairs.length === 0 ? (
                <p className="text-sm text-gray-500 rounded-xl border bg-white p-4">
                  {tradePairs.length === 0 ? "Inga genomförda byten än." : "Inga par matchar sökningen."}
                </p>
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
                      {visibleTradePairs.map((pair) => {
                        const winner = pair.netValueToA >= 0 ? pair.userA : pair.userB;
                        const netAbs = Math.abs(pair.netValueToA);
                        return (
                          <tr key={pair.key} className={pair.exclusive ? "bg-purple-50/50" : undefined}>
                            <td className="px-4 py-2">
                              <div className="font-medium">
                                {pair.userA.username} {"↔"} {pair.userB.username}
                              </div>
                              <div className="text-xs text-gray-500">
                                {pair.userA.email} {"·"} {pair.userB.email}
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
                                    {"→"} {winner.username} +{netAbs}
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
                                  <span className="text-gray-300">{"—"}</span>
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
            </TabsContent>

            {/* Announcements */}
            <TabsContent value="announcements" className="space-y-3 pt-2">
              <form
                onSubmit={(e) => void handlePublishAnnouncement(e)}
                className="rounded-xl border bg-white p-4 space-y-3"
              >
                <div>
                  <label htmlFor="announcement-title" className="block text-sm text-gray-600 mb-1">
                    Rubrik
                  </label>
                  <input
                    id="announcement-title"
                    type="text"
                    value={newAnnouncementTitle}
                    onChange={(e) => setNewAnnouncementTitle(e.target.value)}
                    maxLength={80}
                    placeholder="Kort rubrik, t.ex. Ny funktion"
                    className="w-full h-10 rounded-md border border-gray-200 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  />
                </div>
                <div>
                  <label htmlFor="announcement-body" className="block text-sm text-gray-600 mb-1">
                    Text
                  </label>
                  <textarea
                    id="announcement-body"
                    value={newAnnouncementBody}
                    onChange={(e) => setNewAnnouncementBody(e.target.value)}
                    maxLength={1000}
                    rows={3}
                    placeholder="Meddelandetext"
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                  />
                </div>
                {announcementError && <p className="text-sm text-red-600">{announcementError}</p>}
                <Button
                  type="submit"
                  disabled={publishingAnnouncement || !newAnnouncementTitle.trim() || !newAnnouncementBody.trim()}
                  className="bg-purple-600 hover:bg-purple-700 text-white"
                >
                  {publishingAnnouncement ? "Publicerar..." : "Publicera"}
                </Button>
              </form>

              {announcements.length === 0 ? (
                <p className="text-sm text-gray-500 rounded-xl border bg-white p-4">Inga meddelanden publicerade.</p>
              ) : (
                <ul className="rounded-xl border bg-white divide-y">
                  {announcements.map((a) => (
                    <li key={a.id} className="px-4 py-3 flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="font-medium text-sm">{a.title}</span>
                          <span className="text-xs text-gray-400">{formatDate(a.createdAt)}</span>
                        </div>
                        <p className="text-sm text-gray-600 mt-0.5">{a.body}</p>
                      </div>
                      <button
                        onClick={() => void handleDeleteAnnouncement(a.id)}
                        disabled={deletingAnnouncementId === a.id}
                        className="text-red-600 hover:text-red-800 text-xs font-medium underline shrink-0"
                      >
                        {deletingAnnouncementId === a.id ? "Raderar..." : "Radera"}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </TabsContent>

            {/* Card pool */}
            <TabsContent value="pool" className="space-y-6 pt-2">
              <div className="space-y-3">
                <h2 className="text-sm font-semibold text-gray-700">Per raritet</h2>
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
                      {overview && RARITY_ORDER.filter((r) => overview.pool.byRarity[r]).map((r) => {
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
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <h2 className="text-sm font-semibold text-gray-700">Per kort — sålda vs. kvar</h2>
                  <SearchBox value={poolQuery} onChange={setPoolQuery} placeholder="Sök på kortnamn..." />
                </div>
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
                      {visiblePool.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                            Inga kort matchar sökningen.
                          </td>
                        </tr>
                      ) : (
                        visiblePool.map((p) => (
                          <tr key={p.cardId}>
                            <td className="px-4 py-2">{cardName(p.cardId)}</td>
                            <td className="px-4 py-2 capitalize text-gray-500">{p.rarity}</td>
                            <td className="px-4 py-2 text-right">{p.bought}</td>
                            <td className="px-4 py-2 text-right">{p.remaining}</td>
                            <td className="px-4 py-2 text-right text-gray-500">{p.total}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* User detail modal */}
      {(selectedUser || loadingUser) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setSelectedUser(null)}
        >
          <div
            className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b flex items-start justify-between gap-4">
              <div>
                <h3 className="font-semibold text-lg">
                  {loadingUser ? "Laddar..." : selectedUser?.user.username}
                </h3>
                {selectedUser && (
                  <div className="text-sm text-gray-500 mt-0.5">
                    {selectedUser.user.firstName && selectedUser.user.lastName
                      ? `${selectedUser.user.firstName} ${selectedUser.user.lastName} · `
                      : ""}
                    {selectedUser.user.email}
                    <span className="text-gray-400"> · med sedan {formatDate(selectedUser.user.createdAt)}</span>
                  </div>
                )}
              </div>
              <button
                onClick={() => setSelectedUser(null)}
                className="text-gray-400 hover:text-gray-700 text-xl leading-none shrink-0"
                aria-label="Stäng"
              >
                ×
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-8">
              {selectedUser && <UserDetail detail={selectedUser} />}
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

const TRADE_STATUS_LABEL: Record<string, string> = {
  pending: "Väntar",
  accepted: "Genomfört",
  rejected: "Avböjt",
  cancelled: "Avbrutet",
  countered: "Motbud lämnat",
};

/** Full picture of one player: balance, collection, chests, trades, partners. */
function UserDetail({ detail }: { detail: AdminUserDetail }) {
  const { state, totals, rarityCounts, cards, chests, achievements, trades, partners } = detail;

  // Rarest first, then alphabetically — the interesting cards sort to the top.
  // rarityOrder is a rank map (special 0 … common 4), so lower sorts first.
  const sortedCards = useMemo(
    () =>
      [...cards].sort((a, b) => {
        const ra = cardById(a.cardId)?.rarity;
        const rb = cardById(b.cardId)?.rarity;
        const ia = ra ? rarityOrder[ra] : 99;
        const ib = rb ? rarityOrder[rb] : 99;
        return ia - ib || cardName(a.cardId).localeCompare(cardName(b.cardId), "sv");
      }),
    [cards],
  );

  return (
    <>
      {/* Key numbers */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Diamanter" value={state.diamonds} />
        <StatCard label="Kort totalt" value={totals.totalCards} />
        <StatCard label="Unika kort" value={totals.uniqueCards} />
        <StatCard label="Märkta vill byta" value={totals.markedForTrade} />
        <StatCard label="Kistor" value={totals.chests} />
        <StatCard
          label="Kistplatser"
          value={totals.chestSlots}
          hint={totals.chestSlotTypes.length > 0 ? `fast: ${totals.chestSlotTypes.join(", ")}` : undefined}
        />
        <StatCard label="Byten" value={totals.trades} />
        <StatCard label="Genomförda byten" value={totals.tradesAccepted} />
      </section>

      <p className="text-xs text-gray-500 -mt-4">
        Dagliga diamanter:{" "}
        {state.lastDailyClaimDate
          ? `senast hämtade ${state.lastDailyClaimDate}`
          : "aldrig hämtade"}
        {state.canClaimDailyDiamonds ? " · kan hämta idag" : " · redan hämtade idag"}
        {" · "}
        {totals.achievementsClaimed} av {totals.achievementsTotal} prestationer uthämtade
      </p>

      {/* Rarity split */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Samlingen per raritet</h4>
        <div className="flex flex-wrap gap-2">
          {RARITY_ORDER.map((r) => (
            <span key={r} className="rounded-lg border bg-gray-50 px-3 py-1.5 text-sm">
              <span className="capitalize text-gray-500">{r}</span>{" "}
              <span className="font-semibold">{rarityCounts[r] ?? 0}</span>
            </span>
          ))}
        </div>
      </section>

      {/* Chests */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Kistor ({chests.length})</h4>
        {chests.length === 0 ? (
          <p className="text-sm text-gray-500">Inga olåsta kistor.</p>
        ) : (
          <ul className="text-sm divide-y rounded-xl border">
            {chests.map((chest) => (
              <li key={chest.id} className="flex items-center justify-between px-4 py-2">
                <span>{chest.label}</span>
                <span className={chest.ready ? "text-green-700 font-medium" : "text-gray-500"}>
                  {chest.ready ? "Klar att öppnas" : `Klar ${new Date(chest.readyAt).toLocaleString("sv-SE")}`}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Who they trade with */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Handelspartners ({partners.length})</h4>
        {partners.length === 0 ? (
          <p className="text-sm text-gray-500">Har inte genomfört några byten.</p>
        ) : (
          <div className="rounded-xl border overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500">
                <tr>
                  <th className="text-left px-4 py-2">Spelare</th>
                  <th className="text-right px-4 py-2">Byten</th>
                  <th className="text-right px-4 py-2">Ojämna</th>
                  <th className="text-right px-4 py-2" title="Nettovärde till den här spelaren">Netto</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {partners.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2 font-medium">{p.username}</td>
                    <td className="px-4 py-2 text-right">{p.acceptedTrades}</td>
                    <td className="px-4 py-2 text-right">
                      {p.flaggedTrades > 0
                        ? <span className="text-amber-700 font-medium">{p.flaggedTrades}</span>
                        : <span className="text-gray-400">0</span>}
                    </td>
                    <td className={"px-4 py-2 text-right " + (p.netValue > 0 ? "text-green-700" : p.netValue < 0 ? "text-red-700" : "text-gray-400")}>
                      {p.netValue > 0 ? "+" : ""}{Math.round(p.netValue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Trade history, from this player's point of view */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Byteshistorik ({trades.length})</h4>
        {trades.length === 0 ? (
          <p className="text-sm text-gray-500">Inga byten.</p>
        ) : (
          <div className="rounded-xl border overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">Datum</th>
                  <th className="text-left px-4 py-2">Motpart</th>
                  <th className="text-left px-4 py-2">Ger</th>
                  <th className="text-left px-4 py-2">Får</th>
                  <th className="text-right px-4 py-2">Netto</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-right px-4 py-2">Flaggor</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {trades.map((t) => (
                  <tr key={t.id} className={t.flags.length > 0 ? "bg-amber-50/40" : undefined}>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">{formatDate(t.createdAt)}</td>
                    <td className="px-4 py-2 whitespace-nowrap">
                      <span className="text-gray-400">{t.direction === "sent" ? "→ " : "← "}</span>
                      {t.counterparty.username}
                      {t.isCounter && <span className="ml-1 text-[11px] text-purple-600">(motbud)</span>}
                    </td>
                    <td className="px-4 py-2">{formatSide(t.givesCardIds, t.givesDiamonds)}</td>
                    <td className="px-4 py-2">{formatSide(t.getsCardIds, t.getsDiamonds)}</td>
                    <td className={"px-4 py-2 text-right whitespace-nowrap " + (t.netValue > 0 ? "text-green-700" : t.netValue < 0 ? "text-red-700" : "text-gray-400")}>
                      {t.netValue > 0 ? "+" : ""}{Math.round(t.netValue)}
                    </td>
                    <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                      {TRADE_STATUS_LABEL[t.status] ?? t.status}
                    </td>
                    <td className="px-4 py-2 text-right"><FlagBadges flags={t.flags} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Claimed achievements */}
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">
          Prestationer ({totals.achievementsClaimed} av {totals.achievementsTotal})
        </h4>
        {achievements.length === 0 ? (
          <p className="text-sm text-gray-500">Inga uthämtade prestationer.</p>
        ) : (
          <div className="rounded-xl border overflow-x-auto max-h-56 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2">Prestation</th>
                  <th className="text-right px-4 py-2">Belöning</th>
                  <th className="text-right px-4 py-2">Uthämtad</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {achievements.map((a) => (
                  <tr key={a.id}>
                    <td className="px-4 py-2">{a.title}</td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {a.reward === null ? "–" : `${a.reward} ◆`}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500 whitespace-nowrap">
                      {formatDate(a.claimedAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* The collection itself */}
      <section className="space-y-3">
        <h4 className="text-sm font-semibold">
          Samling ({totals.uniqueCards} unika, {totals.totalCards} kort)
        </h4>
        {sortedCards.length === 0 ? (
          <p className="text-sm text-gray-500">Inga kort.</p>
        ) : (
          <div className="flex flex-wrap gap-4">
            {sortedCards.map(({ cardId, count, markedForTrade }) => {
              const card = cardById(cardId);
              return (
                <div key={cardId} className="relative">
                  <CardPlaceholder
                    rarity={card?.rarity}
                    size="small"
                    name={card?.name ?? cardId}
                    danceStyle={card?.danceStyle}
                    designKey={card?.designKey}
                    showCaption
                  />
                  {count > 1 && (
                    <div className="absolute top-1.5 right-1.5 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white pointer-events-none">
                      ×{count}
                    </div>
                  )}
                  {markedForTrade > 0 && (
                    <div className="absolute top-1.5 left-1.5 z-10 rounded bg-purple-600/90 px-1.5 py-0.5 text-[10px] font-bold leading-none text-white pointer-events-none">
                      Byte {markedForTrade}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}
