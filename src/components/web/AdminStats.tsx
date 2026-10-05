import { useEffect, useState } from "react";
import { cardById } from "../../data/cards";
import { fetchAdminStats, type AdminLeader, type AdminStats, type AdminUpgrade } from "../../utils/adminApi";

const RARITY_LABEL: Record<string, string> = {
  common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", special: "Special",
};

const RANGE_OPTIONS = [7, 30, 90];

function cardName(cardId: string): string {
  return cardById(cardId)?.name ?? cardId;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });
}

function formatNumber(n: number): string {
  return n.toLocaleString("sv-SE");
}

/** "20× Anna, 15× Bo" style summary of the cards an upgrade used up. */
export function summarizeConsumed(cardIds: string[]): string {
  const counts = new Map<string, number>();
  for (const id of cardIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, n]) => (n > 1 ? `${n}× ${cardName(id)}` : cardName(id)))
    .join(", ");
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="text-2xl font-bold tabular-nums">{typeof value === "number" ? formatNumber(value) : value}</div>
      <div className="text-xs text-gray-500 mt-1">{label}</div>
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </div>
  );
}

/**
 * One metric over time as thin bars. Single series, so no legend — the title
 * names it. Hovering a bar shows its date and value above the plot.
 */
function DailyBars({
  title,
  data,
  getValue,
}: {
  title: string;
  data: AdminStats["daily"];
  getValue: (d: AdminStats["daily"][number]) => number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const values = data.map(getValue);
  const max = Math.max(1, ...values);
  const total = values.reduce((a, b) => a + b, 0);
  const shown = hover ?? data.length - 1;

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700">{title}</h3>
        <span className="text-xs text-gray-500 tabular-nums">totalt {formatNumber(total)}</span>
      </div>
      <div className="mt-1 h-5 text-xs text-gray-600 tabular-nums">
        {data[shown] && (
          <>
            <span className="text-gray-400">{data[shown].date}{hover === null ? " (idag)" : ""}:</span>{" "}
            <span className="font-semibold">{formatNumber(values[shown])}</span>
          </>
        )}
      </div>
      <div className="mt-2 flex h-28 items-end gap-[2px] border-b border-gray-200" onMouseLeave={() => setHover(null)}>
        {values.map((v, i) => (
          <div
            key={data[i].date}
            className="flex h-full flex-1 cursor-default items-end"
            onMouseEnter={() => setHover(i)}
            title={`${data[i].date}: ${v}`}
          >
            <div
              className={`w-full rounded-t-[3px] ${hover === i ? "bg-purple-800" : "bg-purple-500"}`}
              style={{ height: v > 0 ? `${Math.max(3, (v / max) * 100)}%` : "0%" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-gray-400 tabular-nums">
        <span>{data[0]?.date}</span>
        <span>{data[data.length - 1]?.date}</span>
      </div>
    </div>
  );
}

function LeaderList({
  title,
  rows,
  unit,
  onOpenUser,
}: {
  title: string;
  rows: AdminLeader[];
  unit?: (r: AdminLeader) => string;
  onOpenUser: (userId: string) => void;
}) {
  return (
    <div className="rounded-xl border bg-white">
      <h3 className="border-b px-4 py-2 text-sm font-semibold text-gray-700">{title}</h3>
      {rows.length === 0 ? (
        <p className="px-4 py-4 text-sm text-gray-400">Ingen data ännu.</p>
      ) : (
        <ol className="divide-y text-sm">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-1.5">
              <span className="w-5 text-right text-xs text-gray-400 tabular-nums">{i + 1}</span>
              <button onClick={() => onOpenUser(r.id)} className="flex-1 truncate text-left text-purple-700 hover:underline">
                {r.username}
              </button>
              <span className="tabular-nums font-medium">{unit ? unit(r) : formatNumber(r.value)}</span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function UpgradeRow({ upgrade, username, onOpenUser }: {
  upgrade: AdminUpgrade;
  username?: { id: string; username: string };
  onOpenUser?: (userId: string) => void;
}) {
  return (
    <tr className="align-top">
      <td className="px-4 py-2 whitespace-nowrap text-gray-500 tabular-nums">{formatDateTime(upgrade.createdAt)}</td>
      {username && (
        <td className="px-4 py-2">
          <button onClick={() => onOpenUser?.(username.id)} className="text-purple-700 hover:underline">
            {username.username}
          </button>
        </td>
      )}
      <td className="px-4 py-2 whitespace-nowrap">
        {RARITY_LABEL[upgrade.fromRarity] ?? upgrade.fromRarity} → {RARITY_LABEL[upgrade.toRarity] ?? upgrade.toRarity}
      </td>
      <td className="px-4 py-2 font-medium">{cardName(upgrade.resultCardId)}</td>
      <td className="px-4 py-2 text-xs text-gray-500">{summarizeConsumed(upgrade.consumedCardIds)}</td>
    </tr>
  );
}

/** The admin "Statistik" tab. Loads its own data so the range can change. */
export function AdminStatsPanel({ onOpenUser }: { onOpenUser: (userId: string) => void }) {
  const [days, setDays] = useState(30);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    fetchAdminStats(days)
      .then((s) => { if (!cancelled) setStats(s); })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Kunde inte ladda statistik."); });
    return () => { cancelled = true; };
  }, [days]);

  if (error) return <p className="text-sm text-red-600 pt-2">{error}</p>;
  if (!stats) return <p className="text-sm text-gray-500 pt-2">Laddar statistik...</p>;

  const { totals, diamondFlow: flow } = stats;
  const earned = flow.daily + flow.chestRewards;
  const spent = flow.packs + flow.chests + flow.slots;

  return (
    <div className="space-y-6 pt-2">
      {/* Range + logging notice */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-lg border bg-white p-1">
          {RANGE_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1 text-sm ${days === d ? "bg-purple-600 text-white" : "text-gray-600 hover:bg-gray-100"}`}
            >
              {d} dagar
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-500">
          Uppgraderingar, paketköp och diamanter loggas{" "}
          {stats.since.events || stats.since.upgrades
            ? `sedan ${formatDateTime([stats.since.events, stats.since.upgrades].filter(Boolean).sort()[0]!)}`
            : "från och med nu"}{" "}
          — äldre aktivitet finns inte sparad.
        </p>
      </div>

      {/* Key numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Spelare" value={totals.players} hint={`+${totals.newPlayers7d} senaste 7 dagarna`} />
        <Tile label="Aktiva idag" value={totals.activeToday} hint={`${totals.active7d} aktiva senaste 7 dagarna`} />
        <Tile label="Paket öppnade" value={totals.packsOpened} hint={`${totals.packsPerPlayer} per spelare i snitt`} />
        <Tile label="Uppgraderingar" value={totals.upgrades} />
        <Tile
          label="Genomförda byten"
          value={totals.tradesAccepted}
          hint={`${totals.tradesPending} väntar · ${totals.trades} totalt`}
        />
        <Tile
          label="Andel accepterade bud"
          value={totals.acceptanceRate === null ? "–" : `${totals.acceptanceRate} %`}
          hint="accepterade av besvarade"
        />
        <Tile label="Diamanter hos spelarna" value={totals.diamondsInCirculation} />
        <Tile
          label="Kort ägda"
          value={totals.cardsOwned}
          hint={`${stats.soldOutCards} kort slutsålda${totals.bannedNow ? ` · ${totals.bannedNow} avstängda` : ""}`}
        />
      </div>

      {/* Activity over time — one small chart per metric */}
      <div className="grid gap-3 md:grid-cols-2">
        <DailyBars title="Aktiva spelare per dag" data={stats.daily} getValue={(d) => d.activePlayers} />
        <DailyBars title="Nya spelare per dag" data={stats.daily} getValue={(d) => d.signups} />
        <DailyBars title="Paket öppnade per dag" data={stats.daily} getValue={(d) => d.packs} />
        <DailyBars title="Bytesbud per dag" data={stats.daily} getValue={(d) => d.trades} />
      </div>

      {/* Upgrades by tier + diamond flow */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Uppgraderingar per nivå (totalt)</h3>
          {stats.upgradesByTier.map((t) => (
            <div key={t.from} className="flex items-center justify-between text-sm">
              <span>
                {RARITY_LABEL[t.from]} → {RARITY_LABEL[t.to]}
                <span className="ml-2 text-xs text-gray-400">{t.cardsPerUpgrade} kort per uppgradering</span>
              </span>
              <span className="font-semibold tabular-nums">{formatNumber(t.count)}</span>
            </div>
          ))}
        </div>
        <div className="rounded-xl border bg-white p-4 space-y-2 text-sm">
          <h3 className="text-sm font-semibold text-gray-700">Diamantflöde, senaste {stats.days} dagarna</h3>
          <div className="flex justify-between"><span className="text-gray-600">In: dagliga diamanter</span><span className="tabular-nums">+{formatNumber(flow.daily)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">In: kistbelöningar</span><span className="tabular-nums">+{formatNumber(flow.chestRewards)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Ut: paket</span><span className="tabular-nums">−{formatNumber(flow.packs)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Ut: kistor</span><span className="tabular-nums">−{formatNumber(flow.chests)}</span></div>
          <div className="flex justify-between"><span className="text-gray-600">Ut: kistplatser</span><span className="tabular-nums">−{formatNumber(flow.slots)}</span></div>
          <div className="flex justify-between border-t pt-2 font-semibold">
            <span>Netto</span>
            <span className="tabular-nums">{earned - spent >= 0 ? "+" : "−"}{formatNumber(Math.abs(earned - spent))}</span>
          </div>
        </div>
      </div>

      {/* Leaderboards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <LeaderList title="Flest paket öppnade" rows={stats.leaders.packs} onOpenUser={onOpenUser} />
        <LeaderList title="Flest uppgraderingar" rows={stats.leaders.upgrades} onOpenUser={onOpenUser} />
        <LeaderList title="Flest genomförda byten" rows={stats.leaders.trades} onOpenUser={onOpenUser} />
        <LeaderList title="Mest diamanter" rows={stats.leaders.diamonds} onOpenUser={onOpenUser} />
        <LeaderList
          title="Störst samling (unika kort)"
          rows={stats.leaders.collection}
          unit={(r) => `${r.value} · ${r.percent} %`}
          onOpenUser={onOpenUser}
        />
        <div className="rounded-xl border bg-white">
          <h3 className="border-b px-4 py-2 text-sm font-semibold text-gray-700">Mest ägda kort (ej common)</h3>
          {stats.topCards.length === 0 ? (
            <p className="px-4 py-4 text-sm text-gray-400">Ingen data ännu.</p>
          ) : (
            <ol className="divide-y text-sm">
              {stats.topCards.map((c) => (
                <li key={c.cardId} className="flex items-center gap-3 px-4 py-1.5">
                  <span className="flex-1 truncate">{cardName(c.cardId)}</span>
                  <span className="text-xs text-gray-400">{RARITY_LABEL[c.rarity] ?? c.rarity}</span>
                  <span className="tabular-nums font-medium" title={`${c.owners} ägare`}>{c.copies}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>

      {/* Latest upgrades */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700">Senaste uppgraderingar ({stats.recentUpgrades.length})</h3>
        <div className="rounded-xl border bg-white overflow-x-auto max-h-[480px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 sticky top-0">
              <tr>
                <th className="text-left px-4 py-2">Tid</th>
                <th className="text-left px-4 py-2">Spelare</th>
                <th className="text-left px-4 py-2">Nivå</th>
                <th className="text-left px-4 py-2">Fick</th>
                <th className="text-left px-4 py-2">Använde</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {stats.recentUpgrades.length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">Inga uppgraderingar loggade ännu.</td></tr>
              ) : (
                stats.recentUpgrades.map((u) => (
                  <UpgradeRow key={u.id} upgrade={u} username={u.user} onOpenUser={onOpenUser} />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
