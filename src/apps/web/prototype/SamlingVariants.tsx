// PROTOTYPE — throwaway. Three layouts for Samling, each with its own take on
// the Upgrade action (pick a Rarity → game auto-selects Duplicates → adjust →
// confirm). Assumption: auto-select skips Cards set to Behåll.

import { useMemo, useState } from "react";
import { ChevronDown, Minus, Plus, Search, Sparkles, X } from "lucide-react";
import {
  cardsIn, collections, rarityBg, rarityLabel, rarityText, sortCards, upgradeRule, RARITIES, type CardRarity, type DanceCard,
} from "./data";
import { Bar, CardThumb, Sheet, useProgress, useStore } from "./kit";

export type Filter = "alla" | "saknas" | "dubbletter";

export function useSamling() {
  const s = useStore();
  const [col, setCol] = useState(collections[collections.length - 1].id);
  const [filter, setFilter] = useState<Filter>("alla");
  const [rarity, setRarity] = useState<CardRarity | "alla">("alla");
  const [q, setQ] = useState("");
  const all = useMemo(() => sortCards(cardsIn(col)), [col]);
  const list = all.filter((c) => {
    const n = s.owned[c.id] ?? 0;
    if (filter === "saknas" && n > 0) return false;
    if (filter === "dubbletter" && n < 2) return false;
    if (rarity !== "alla" && c.rarity !== rarity) return false;
    if (q && !`${c.name} ${c.club ?? ""}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  return { col, setCol, filter, setFilter, rarity, setRarity, q, setQ, all, list };
}

export function CollectionPills({ col, setCol }: { col: string; setCol: (c: string) => void }) {
  return (
    <div className="flex gap-2 overflow-x-auto">
      {collections.map((c) => (
        <button key={c.id} onClick={() => setCol(c.id)} className={`h-9 shrink-0 rounded-full px-4 text-sm ${c.id === col ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700"}`}>{c.label}</button>
      ))}
    </div>
  );
}

export function FilterChips({ filter, setFilter }: { filter: Filter; setFilter: (f: Filter) => void }) {
  return (
    <div className="flex gap-1.5">
      {(["alla", "saknas", "dubbletter"] as Filter[]).map((f) => (
        <button key={f} onClick={() => setFilter(f)} className={`h-9 rounded-full border px-3 text-sm capitalize ${filter === f ? "border-purple-600 bg-purple-50 font-medium text-purple-800" : "text-gray-600"}`}>{f}</button>
      ))}
    </div>
  );
}

export const milestones = [
  { label: "Första Rare", done: true }, { label: "Första Epic", done: true }, { label: "Första Legendary", done: false },
  { label: "Alla Common", done: false }, { label: "Hela samlingen · 5 000 💎", done: false },
];

// ── Upgrade logic (shared), UI differs per variant ──────────────────────────

export function useUpgrade(col: string) {
  const s = useStore();
  const [from, setFrom] = useState<CardRarity | null>(null);
  const [sel, setSel] = useState<Record<string, number>>({});
  const rule = from ? upgradeRule[from] : undefined;
  const dupes = useMemo(() => (from ? cardsIn(col).filter((c) => c.rarity === from && (s.owned[c.id] ?? 0) > 1) : []), [from, col, s.owned]);
  const pick = (r: CardRarity) => {
    const rl = upgradeRule[r]!;
    const pool = cardsIn(col).filter((c) => c.rarity === r && (s.owned[c.id] ?? 0) > 1 && !s.keep.has(c.id))
      .sort((a, b) => (s.owned[b.id] ?? 0) - (s.owned[a.id] ?? 0));
    const out: Record<string, number> = {};
    let left = rl.cost;
    for (const c of pool) { if (left <= 0) break; const take = Math.min(left, s.owned[c.id] - 1); out[c.id] = take; left -= take; }
    setFrom(r); setSel(out);
  };
  const total = Object.values(sel).reduce((a, b) => a + b, 0);
  const adjust = (id: string, d: number) => setSel((x) => ({ ...x, [id]: Math.max(0, Math.min((s.owned[id] ?? 1) - 1, (x[id] ?? 0) + d)) }));
  const confirm = () => {
    if (!rule || total !== rule.cost) return;
    const owned = { ...s.owned };
    for (const [id, n] of Object.entries(sel)) owned[id] -= n;
    const target = cardsIn(col).filter((c) => c.rarity === rule.to);
    const got = target[Math.floor(Math.random() * target.length)];
    owned[got.id] = (owned[got.id] ?? 0) + 1;
    s.set({ owned, sheetCardId: got.id });
    s.say(`Upgrade: ${rarityLabel[rule.to]}!`);
    setFrom(null); setSel({});
  };
  const available = (r: CardRarity) => cardsIn(col).filter((c) => c.rarity === r).reduce((n, c) => n + Math.max(0, (s.owned[c.id] ?? 0) - 1), 0);
  return { from, setFrom, sel, rule, dupes, pick, total, adjust, confirm, available, reset: () => { setFrom(null); setSel({}); } };
}

function RarityPicker({ u }: { u: ReturnType<typeof useUpgrade> }) {
  return (
    <div className="space-y-2">
      {(["common", "rare", "epic"] as CardRarity[]).map((r) => {
        const rl = upgradeRule[r]!;
        const have = u.available(r);
        return (
          <button key={r} onClick={() => u.pick(r)} className="flex h-16 w-full items-center gap-3 rounded-xl border px-4 text-left">
            <span className={`h-3 w-3 rounded-full ${rarityBg[r]}`} />
            <span className="flex-1"><span className="block text-sm font-medium">{rl.cost} {rarityLabel[r]} → 1 {rarityLabel[rl.to]}</span><span className="block text-xs text-gray-500">Du har {have} Dubbletter</span></span>
            <span className={`text-sm font-medium ${have >= rl.cost ? "text-green-700" : "text-gray-400"}`}>{have >= rl.cost ? "Redo" : `${Math.round((100 * have) / rl.cost)} %`}</span>
          </button>
        );
      })}
    </div>
  );
}

export function UpgradeFooter({ u }: { u: ReturnType<typeof useUpgrade> }) {
  const ok = u.rule && u.total === u.rule.cost;
  return (
    <div className="border-t bg-white p-3">
      <div className="mb-2 flex justify-between text-sm"><span>Valda</span><span className={`tabular-nums font-semibold ${ok ? "text-green-700" : ""}`}>{u.total} / {u.rule?.cost}</span></div>
      <Bar value={u.total} total={u.rule?.cost ?? 1} className={ok ? "bg-green-500" : undefined} />
      <button disabled={!ok} onClick={u.confirm} className="mt-3 h-12 w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 font-medium text-white disabled:from-gray-300 disabled:to-gray-300">
        {ok ? `Uppgradera till ${rarityLabel[u.rule!.to]}` : u.total < (u.rule?.cost ?? 0) ? `Saknar ${u.rule!.cost - u.total}` : "För många valda"}
      </button>
    </div>
  );
}

// ── A: Rutnät ────────────────────────────────────────────────────────────────
// Progress header + sticky filters + 3-col grid. Upgrade in a bottom sheet,
// selection shown as a grid of chosen Cards with steppers.

function SamlingA() {
  const s = useStore();
  const v = useSamling();
  const p = useProgress(v.col);
  const u = useUpgrade(v.col);
  const [up, setUp] = useState(false);
  const [showMs, setShowMs] = useState(false);
  return (
    <div>
      <div className="space-y-3 p-4 pb-2">
        <CollectionPills col={v.col} setCol={v.setCol} />
        <div className="rounded-2xl border p-4">
          <div className="flex items-baseline justify-between"><span className="text-2xl font-semibold tabular-nums">{p.have} <span className="text-base text-gray-400">/ {p.total}</span></span>
            <button onClick={() => setUp(true)} className="flex h-10 items-center gap-1 rounded-lg bg-purple-100 px-3 text-sm font-medium text-purple-800"><Sparkles className="h-4 w-4" />Uppgradera</button></div>
          <div className="mt-3 grid grid-cols-5 gap-2">
            {RARITIES.map((r) => (
              <div key={r}><div className={`text-[10px] font-semibold uppercase ${rarityText[r]}`}>{rarityLabel[r].slice(0, 4)}</div><div className="text-xs tabular-nums">{p.rarity[r].have}/{p.rarity[r].total}</div><Bar value={p.rarity[r].have} total={p.rarity[r].total} className={rarityBg[r]} /></div>
            ))}
          </div>
          <button onClick={() => setShowMs(!showMs)} className="mt-3 flex items-center gap-1 text-xs text-gray-500">Prestationer 2/5 <ChevronDown className={`h-3 w-3 ${showMs ? "rotate-180" : ""}`} /></button>
          {showMs && <div className="mt-2 flex flex-wrap gap-1">{milestones.map((m) => <span key={m.label} className={`rounded-full px-2 py-1 text-[11px] ${m.done ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>{m.done ? "✓ " : ""}{m.label}</span>)}</div>}
        </div>
      </div>
      <div className="sticky top-12 z-10 space-y-2 border-b bg-white px-4 py-2">
        <div className="flex items-center justify-between"><FilterChips filter={v.filter} setFilter={v.setFilter} />
          <select value={v.rarity} onChange={(e) => v.setRarity(e.target.value as CardRarity)} className="h-9 rounded-lg border px-2 text-sm"><option value="alla">Rarity</option>{RARITIES.map((r) => <option key={r} value={r}>{rarityLabel[r]}</option>)}</select></div>
        <div className="flex h-10 items-center gap-2 rounded-lg bg-gray-100 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={v.q} onChange={(e) => v.setQ(e.target.value)} placeholder="Sök par eller förening" className="flex-1 bg-transparent text-sm outline-none" /></div>
      </div>
      <div className="grid grid-cols-3 gap-3 p-4">
        {v.list.map((c) => (
          <div key={c.id}><CardThumb card={c} count={s.owned[c.id]} /><div className="mt-1 truncate text-[11px]">{c.name}</div></div>
        ))}
      </div>
      <Sheet open={up} onClose={() => { setUp(false); u.reset(); }} title={u.from ? `Uppgradera ${rarityLabel[u.from]}` : "Uppgradera"} full={!!u.from}>
        {!u.from ? <RarityPicker u={u} /> : (
          <div className="-m-4 flex h-full flex-col">
            <p className="px-4 pt-3 text-xs text-gray-500">Vi har valt dina största Dubbletter. Justera med − / +. Card med Behåll är inte valda.</p>
            <div className="grid flex-1 grid-cols-3 gap-3 overflow-y-auto p-4">
              {u.dupes.map((c) => (
                <div key={c.id}>
                  <CardThumb card={c} count={s.owned[c.id]} selected={(u.sel[c.id] ?? 0) > 0} dim={!u.sel[c.id]} onClick={() => u.adjust(c.id, u.sel[c.id] ? -99 : 99)} />
                  <div className="mt-1 flex items-center justify-between">
                    <button onClick={() => u.adjust(c.id, -1)} className="grid h-8 w-8 place-items-center rounded-full border"><Minus className="h-3 w-3" /></button>
                    <span className="text-xs tabular-nums">{u.sel[c.id] ?? 0}</span>
                    <button onClick={() => u.adjust(c.id, 1)} className="grid h-8 w-8 place-items-center rounded-full border"><Plus className="h-3 w-3" /></button>
                  </div>
                </div>
              ))}
            </div>
            <UpgradeFooter u={u} />
          </div>
        )}
      </Sheet>
    </div>
  );
}

// ── B: Sektioner ─────────────────────────────────────────────────────────────
// Grouped by Rarity, 4 columns, missing Cards inline as silhouettes. Progress
// lives in each section header; Upgrade starts from the section it applies to.

function SamlingB() {
  const s = useStore();
  const v = useSamling();
  const p = useProgress(v.col);
  const u = useUpgrade(v.col);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set(["common"]));
  if (u.from) {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] flex-col">
        <div className="flex items-center gap-2 border-b px-2 py-2"><button onClick={u.reset} className="grid h-11 w-11 place-items-center"><X className="h-5 w-5" /></button><span className="font-semibold">Uppgradera {rarityLabel[u.from]}</span></div>
        <div className="flex-1 divide-y overflow-y-auto">
          {u.dupes.map((c) => (
            <div key={c.id} className="flex h-16 items-center gap-3 px-4">
              <div className="w-10"><CardThumb card={c} onClick={() => {}} /></div>
              <div className="flex-1 truncate text-sm">{c.name}<div className="text-xs text-gray-500">{s.owned[c.id] - 1} Dubbletter{s.keep.has(c.id) ? " · Behåll" : ""}</div></div>
              <button onClick={() => u.adjust(c.id, -1)} className="grid h-10 w-10 place-items-center rounded-full border"><Minus className="h-4 w-4" /></button>
              <span className="w-6 text-center tabular-nums">{u.sel[c.id] ?? 0}</span>
              <button onClick={() => u.adjust(c.id, 1)} className="grid h-10 w-10 place-items-center rounded-full border"><Plus className="h-4 w-4" /></button>
            </div>
          ))}
        </div>
        <div className="sticky bottom-14"><UpgradeFooter u={u} /></div>
      </div>
    );
  }
  return (
    <div>
      <div className="sticky top-12 z-10 space-y-2 border-b bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <select value={v.col} onChange={(e) => v.setCol(e.target.value)} className="h-10 rounded-lg border px-2 text-sm font-medium">{collections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <div className="flex-1"><Bar value={p.have} total={p.total} /></div><span className="text-sm tabular-nums">{p.have}/{p.total}</span>
        </div>
        <div className="flex items-center gap-2"><FilterChips filter={v.filter} setFilter={v.setFilter} />
          <div className="flex h-9 flex-1 items-center rounded-full bg-gray-100 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={v.q} onChange={(e) => v.setQ(e.target.value)} className="w-full bg-transparent pl-1 text-sm outline-none" /></div></div>
      </div>
      {(["special", "legendary", "epic", "rare", "common"] as CardRarity[]).map((r) => {
        const list = v.list.filter((c) => c.rarity === r);
        if (!list.length) return null;
        const isOpen = !collapsed.has(r);
        const rl = upgradeRule[r];
        return (
          <section key={r} className="border-b">
            <div className="flex h-12 items-center gap-2 px-3">
              <button onClick={() => { const n = new Set(collapsed); isOpen ? n.add(r) : n.delete(r); setCollapsed(n); }} className="flex flex-1 items-center gap-2 text-left">
                <ChevronDown className={`h-4 w-4 text-gray-400 ${isOpen ? "" : "-rotate-90"}`} />
                <span className={`text-sm font-semibold ${rarityText[r]}`}>{rarityLabel[r]}</span>
                <span className="text-sm tabular-nums text-gray-500">{p.rarity[r].have}/{p.rarity[r].total}</span>
              </button>
              {rl && <button onClick={() => u.pick(r)} className="h-8 rounded-full bg-purple-50 px-3 text-xs font-medium text-purple-800">↑ {rarityLabel[rl.to]} · {u.available(r)}/{rl.cost}</button>}
            </div>
            {isOpen && (
              <div className="grid grid-cols-4 gap-2 px-3 pb-3">
                {list.map((c) => <CardThumb key={c.id} card={c} count={s.owned[c.id]} />)}
              </div>
            )}
          </section>
        );
      })}
      <div className="flex flex-wrap gap-1 p-3">{milestones.map((m) => <span key={m.label} className={`rounded-full px-2 py-1 text-[11px] ${m.done ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>{m.done ? "✓ " : "○ "}{m.label}</span>)}</div>
    </div>
  );
}

// ── C: Lista ─────────────────────────────────────────────────────────────────
// Text-first rows (thumb, name, ×N). Upgrade is an in-place selection mode on
// the same list, with a sticky action bar.

function SamlingC() {
  const s = useStore();
  const v = useSamling();
  const p = useProgress(v.col);
  const u = useUpgrade(v.col);
  const [choosing, setChoosing] = useState(false);
  const rows: DanceCard[] = u.from ? u.dupes : v.list;
  return (
    <div>
      <div className="space-y-3 p-4">
        <CollectionPills col={v.col} setCol={v.setCol} />
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <div className="text-sm text-gray-500">Samlat</div>
            <div className="text-xl font-semibold tabular-nums">{p.have} / {p.total}</div>
            <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-gray-100">
              {RARITIES.map((r) => <div key={r} className={rarityBg[r]} style={{ width: `${(100 * p.rarity[r].have) / p.total}%` }} />)}
            </div>
          </div>
          {!u.from && <button onClick={() => setChoosing(true)} className="h-11 rounded-xl border px-3 text-sm font-medium">Uppgradera</button>}
        </div>
        {!u.from && <div className="flex items-center gap-2"><FilterChips filter={v.filter} setFilter={v.setFilter} /></div>}
        {!u.from && <div className="flex h-10 items-center gap-2 rounded-lg border px-3"><Search className="h-4 w-4 text-gray-400" /><input value={v.q} onChange={(e) => v.setQ(e.target.value)} placeholder="Sök" className="flex-1 text-sm outline-none" /></div>}
        {u.from && <div className="flex items-center justify-between rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-900"><span>Välj {rarityLabel[u.from]}-Dubbletter</span><button onClick={u.reset} className="font-medium">Avbryt</button></div>}
      </div>
      <div className="divide-y border-t">
        {rows.map((c) => {
          const n = s.owned[c.id] ?? 0;
          return (
            <div key={c.id} className="flex h-16 items-center gap-3 px-4">
              <div className="w-10 shrink-0"><CardThumb card={c} /></div>
              <button onClick={() => s.set({ sheetCardId: c.id })} className="min-w-0 flex-1 text-left">
                <div className={`truncate text-sm ${n ? "" : "text-gray-400"}`}>{c.name}</div>
                <div className={`text-[11px] ${rarityText[c.rarity]}`}>{rarityLabel[c.rarity]}{c.club ? <span className="text-gray-400"> · {c.club}</span> : null}</div>
              </button>
              {u.from ? (
                <div className="flex items-center gap-1">
                  <button onClick={() => u.adjust(c.id, -1)} className="grid h-10 w-10 place-items-center rounded-full border"><Minus className="h-4 w-4" /></button>
                  <span className="w-8 text-center text-sm tabular-nums">{u.sel[c.id] ?? 0}<span className="text-gray-400">/{n - 1}</span></span>
                  <button onClick={() => u.adjust(c.id, 1)} className="grid h-10 w-10 place-items-center rounded-full border"><Plus className="h-4 w-4" /></button>
                </div>
              ) : n > 1 ? <span className="text-sm tabular-nums text-gray-600">×{n}</span> : n === 0 ? <span className="text-xs text-purple-700">Saknas</span> : null}
            </div>
          );
        })}
      </div>
      {u.from && <div className="sticky bottom-14 z-20"><UpgradeFooter u={u} /></div>}
      <Sheet open={choosing} onClose={() => setChoosing(false)} title="Vad vill du uppgradera?">
        <div onClickCapture={() => setTimeout(() => setChoosing(false))}><RarityPicker u={u} /></div>
      </Sheet>
    </div>
  );
}

export const samlingVariants = { A: { name: "Rutnät", C: SamlingA }, B: { name: "Sektioner", C: SamlingB }, C: { name: "Lista", C: SamlingC } };
