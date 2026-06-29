import { useEffect, useMemo, useState } from "react";
import { Button } from "../../components/shared/ui/button";
import { cardById } from "../../data/cards";
import {
  adminLogin,
  adminLogout,
  adminMe,
  fetchAdminOverview,
  fetchAdminPool,
  fetchAdminUserCards,
  fetchAdminUsers,
  type AdminOverview,
  type AdminPoolEntry,
  type AdminUser,
  type AdminUserCards,
} from "../../utils/adminApi";

const RARITY_ORDER = ["special", "legendary", "epic", "rare", "common"];

function cardName(cardId: string): string {
  return cardById(cardId)?.name ?? cardId;
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
  const [error, setError] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<AdminUserCards | null>(null);
  const [loadingUser, setLoadingUser] = useState(false);

  useEffect(() => {
    Promise.all([fetchAdminOverview(), fetchAdminUsers(), fetchAdminPool()])
      .then(([o, u, p]) => { setOverview(o); setUsers(u); setPool(p); })
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
                    <th className="text-left px-4 py-2">E-post</th>
                    <th className="text-right px-4 py-2">◆</th>
                    <th className="text-right px-4 py-2">Unika</th>
                    <th className="text-right px-4 py-2">Totalt</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="px-4 py-2 font-medium">{u.username}</td>
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
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
