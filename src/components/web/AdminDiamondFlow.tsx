import { useEffect, useState } from "react";
import { Button } from "../shared/ui/button";
import {
  fetchAdminDiamondFlow,
  grantAdminDiamonds,
  type AdminDiamondFlow,
  type AdminDiamondFlowDay,
  type AdminUserDetail,
} from "../../utils/adminApi";

const SOURCES: { key: keyof AdminDiamondFlowDay["sources"]; label: string }[] = [
  { key: "daily", label: "Daglig" },
  { key: "streak", label: "Streak" },
  { key: "weeklyGoals", label: "Veckomål" },
  { key: "achievements", label: "Achievements" },
  { key: "chestPayouts", label: "Kistutbetalning" },
  { key: "eventGifts", label: "Eventgåvor" },
  { key: "adminGrants", label: "Admin-gåvor" },
];
const SINKS: { key: keyof AdminDiamondFlowDay["sinks"]; label: string }[] = [
  { key: "packs", label: "Packs" },
  { key: "chests", label: "Kistor" },
  { key: "slots", label: "Platser" },
];

const HISTORY_LABEL: Record<string, string> = {
  daily: "Daglig", streak_bonus: "Streak", weekly_goal: "Veckomål", achievement: "Achievement",
  chest_open: "Kistutbetalning", event_gift: "Eventgåva", admin_grant: "Admin-gåva",
  pack: "Pack", chest_buy: "Kista", slot_buy: "Kistplats", trade_diamonds: "Byte (gav bort)",
};

/** The "Diamanter" tab: every source and sink per day, earned per active player vs. the target. */
export function AdminDiamondFlowPanel() {
  const [days, setDays] = useState(30);
  const [flow, setFlow] = useState<AdminDiamondFlow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetchAdminDiamondFlow(days)
      .then((f) => { if (live) { setFlow(f); setError(null); } })
      .catch((e) => { if (live) setError(e instanceof Error ? e.message : "Kunde inte ladda flödet."); });
    return () => { live = false; };
  }, [days]);

  if (error) return <p className="text-sm text-rarity-legendary">{error}</p>;
  if (!flow) return <p className="text-sm text-secondary">Laddar...</p>;

  const rows = [...flow.days].reverse();
  const max = Math.max(flow.target, ...flow.days.map((d) => d.earnedPerActivePlayer ?? 0));
  const num = (n: number) => (n === 0 ? <span className="text-tertiary">–</span> : n.toLocaleString("sv-SE"));

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Diamantflöde</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-md border bg-surface px-2 py-1 text-sm">
          {[7, 30, 90].map((n) => <option key={n} value={n}>{n} dagar</option>)}
        </select>
      </div>

      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Intjänat per aktiv spelare och dag (mål ~{flow.target})</h4>
        <div className="relative rounded-xl border bg-surface p-3">
          <div className="flex items-end gap-0.5 h-32" role="img" aria-label="Diamanter per aktiv spelare per dag">
            {flow.days.map((d) => (
              <div key={d.date} className="flex-1 bg-brand/60 rounded-t min-w-[2px]"
                style={{ height: `${((d.earnedPerActivePlayer ?? 0) / max) * 100}%` }}
                title={`${d.date}: ${d.earnedPerActivePlayer ?? "–"}`} />
            ))}
          </div>
          <div className="absolute left-3 right-3 border-t border-dashed border-rarity-legendary pointer-events-none"
            style={{ bottom: `calc(0.75rem + ${(flow.target / max) * 8}rem)` }}>
            <span className="absolute right-0 -top-4 text-[10px] text-rarity-legendary">mål {flow.target}</span>
          </div>
        </div>
      </section>

      <div className="rounded-xl border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-raised text-secondary">
            <tr>
              <th className="text-left px-3 py-2">Dag</th>
              {SOURCES.map((s) => <th key={s.key} className="text-right px-3 py-2">{s.label}</th>)}
              <th className="text-right px-3 py-2">Intjänat</th>
              {SINKS.map((s) => <th key={s.key} className="text-right px-3 py-2">{s.label}</th>)}
              <th className="text-right px-3 py-2">Aktiva</th>
              <th className="text-right px-3 py-2">Per aktiv</th>
              <th className="text-right px-3 py-2">Byten*</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            <tr className="font-semibold bg-raised/50">
              <td className="px-3 py-2">Totalt</td>
              {SOURCES.map((s) => <td key={s.key} className="text-right px-3 py-2">{num(flow.totals.sources[s.key])}</td>)}
              <td className="text-right px-3 py-2">{num(flow.totals.earned)}</td>
              {SINKS.map((s) => <td key={s.key} className="text-right px-3 py-2">{num(flow.totals.sinks[s.key])}</td>)}
              <td /><td />
              <td className="text-right px-3 py-2">{num(flow.totals.tradeDiamonds)}</td>
            </tr>
            {rows.map((d) => (
              <tr key={d.date}>
                <td className="px-3 py-2 whitespace-nowrap">{d.date}</td>
                {SOURCES.map((s) => <td key={s.key} className="text-right px-3 py-2">{num(d.sources[s.key])}</td>)}
                <td className="text-right px-3 py-2">{num(d.earned)}</td>
                {SINKS.map((s) => <td key={s.key} className="text-right px-3 py-2">{num(d.sinks[s.key])}</td>)}
                <td className="text-right px-3 py-2">{d.activePlayers}</td>
                <td className="text-right px-3 py-2">
                  {d.earnedPerActivePlayer === null ? <span className="text-tertiary">–</span> : (
                    <span className={d.earnedPerActivePlayer >= flow.target ? "text-rarity-legendary font-medium" : ""}>{d.earnedPerActivePlayer}</span>
                  )}
                </td>
                <td className="text-right px-3 py-2">{num(d.tradeDiamonds)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-secondary">
        * Diamanter som flyttats mellan spelare i byten. De skapas eller förstörs inte och räknas därför inte som intjänade eller spenderade.
      </p>
    </div>
  );
}

/** Grant Diamonds to one player; the reason is required and kept in their history. Diamonds only, never Copies. */
export function DiamondGrantControl({ userId, onGranted }: { userId: string; onGranted: () => void }) {
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await grantAdminDiamonds(userId, Number(amount), reason.trim());
      setAmount("");
      setReason("");
      onGranted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte ge diamanter.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2 rounded-xl border p-4">
      <h4 className="text-sm font-semibold">Ge diamanter</h4>
      <div className="flex flex-wrap items-end gap-2">
        <input type="number" min={1} inputMode="numeric" placeholder="Antal" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-24 rounded-md border bg-surface px-2 py-1 text-sm" />
        <input type="text" maxLength={300} placeholder="Orsak (krävs)" value={reason} onChange={(e) => setReason(e.target.value)}
          className="min-w-[12rem] flex-1 rounded-md border bg-surface px-2 py-1 text-sm" />
        <Button size="sm" disabled={busy || !(Number(amount) > 0) || reason.trim() === ""} onClick={() => void submit()}>Ge</Button>
      </div>
      {error && <p className="text-xs text-rarity-legendary">{error}</p>}
    </section>
  );
}

export function DiamondHistory({ history }: { history: AdminUserDetail["diamondHistory"] }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">Diamanthistorik ({history.length})</h4>
      {history.length === 0 ? (
        <p className="text-sm text-secondary">Inga loggade diamantrörelser.</p>
      ) : (
        <div className="rounded-xl border overflow-x-auto max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-raised text-secondary sticky top-0">
              <tr>
                <th className="text-left px-4 py-2">Tid</th>
                <th className="text-left px-4 py-2">Typ</th>
                <th className="text-right px-4 py-2">Diamanter</th>
                <th className="text-left px-4 py-2">Orsak</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {history.map((h, i) => (
                <tr key={i}>
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(h.createdAt).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-2">{HISTORY_LABEL[h.type] ?? h.type}</td>
                  <td className="px-4 py-2 text-right">{h.diamonds.toLocaleString("sv-SE")}</td>
                  <td className="px-4 py-2 text-secondary">{h.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
