// PROTOTYPE — throwaway. Samling (phone pick: B · Sektioner) at desktop width.
// Same parts: Collection picker, progress, Alla/Saknas/Dubbletter, search,
// collapsible Rarity sections with missing Cards as silhouettes, Upgrade from
// each Rarity, Achievement milestones. Assumption carried over: auto-select
// skips Cards set to Behåll.

import { useState } from "react";
import { ChevronDown, Minus, Plus, Search } from "lucide-react";
import { collections, rarityBg, rarityLabel, rarityText, upgradeRule, type CardRarity, type DanceCard } from "./data";
import { Bar, CardThumb, Page, Sheet, useProgress, useStore } from "./kit";
import { Scoreboard, TrophyShelf } from "./Baren";
import { FilterChips, UpgradeFooter, milestones, useSamling, useUpgrade } from "./SamlingVariants";

const ORDER: CardRarity[] = ["special", "legendary", "epic", "rare", "common"];
type V = ReturnType<typeof useSamling>;
type U = ReturnType<typeof useUpgrade>;

function Milestones() {
  return <div className="flex flex-wrap gap-1.5">{milestones.map((m) => <span key={m.label} className={`rounded-full px-2.5 py-1 text-xs ${m.done ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-500"}`}>{m.done ? "✓ " : "○ "}{m.label}</span>)}</div>;
}

function SearchBox({ v, className = "" }: { v: V; className?: string }) {
  return <div className={`flex h-10 items-center gap-2 rounded-full bg-gray-100 px-3 ${className}`}><Search className="h-4 w-4 text-gray-400" /><input value={v.q} onChange={(e) => v.setQ(e.target.value)} placeholder="Sök par eller förening" className="w-full bg-transparent text-sm outline-none" /></div>;
}

/** The Rarity sections, shared; `cols` is the only thing desktop changes here. */
function Sections({ v, u, cols, onUpgrade, named, noSpecial }: { v: V; u: U; cols: string; onUpgrade: (r: CardRarity) => void; named?: boolean; noSpecial?: boolean }) {
  const s = useStore();
  const p = useProgress(v.col);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  return (
    <>
      {ORDER.filter((r) => !(noSpecial && r === "special")).map((r) => {
        const list = v.list.filter((c) => c.rarity === r);
        if (!list.length) return null;
        const isOpen = !collapsed.has(r);
        const rl = upgradeRule[r];
        return (
          <section key={r} id={`r-${r}`} className="scroll-mt-32 rounded-xl border bg-white">
            <div className="flex h-12 items-center gap-2 px-4">
              <button onClick={() => { const n = new Set(collapsed); isOpen ? n.add(r) : n.delete(r); setCollapsed(n); }} className="flex flex-1 items-center gap-2 text-left">
                <ChevronDown className={`h-4 w-4 text-gray-400 ${isOpen ? "" : "-rotate-90"}`} />
                <span className={`font-display text-lg italic ${rarityText[r]}`}>{rarityLabel[r]}</span>
                <span className="text-sm tabular-nums text-gray-500">{p.rarity[r].have}/{p.rarity[r].total}</span>
              </button>
              {rl && <button onClick={() => onUpgrade(r)} className="h-8 rounded-full bg-purple-50 px-3 text-xs font-medium text-purple-800 hover:bg-purple-100">↑ {rarityLabel[rl.to]} · {u.available(r)}/{rl.cost}</button>}
            </div>
            {isOpen && (
              <div className={`grid ${cols} gap-3 px-4 pb-4`}>
                {list.map((c) => named
                  ? <div key={c.id}><CardThumb card={c} count={s.owned[c.id]} /><div className={`mt-1 truncate text-[11px] ${s.owned[c.id] ? "" : "text-gray-400"}`}>{c.name}</div></div>
                  : <CardThumb key={c.id} card={c} count={s.owned[c.id]} />)}
              </div>
            )}
          </section>
        );
      })}
    </>
  );
}

function StepperRow({ c, u }: { c: DanceCard; u: U }) {
  const s = useStore();
  return (
    <div className="flex h-16 items-center gap-3">
      <div className="w-10"><CardThumb card={c} onClick={() => {}} /></div>
      <div className="flex-1 truncate text-sm">{c.name}<div className="text-xs text-gray-500">{s.owned[c.id] - 1} Dubbletter{s.keep.has(c.id) ? " · Behåll" : ""}</div></div>
      <button onClick={() => u.adjust(c.id, -1)} className="grid h-9 w-9 place-items-center rounded-full border"><Minus className="h-4 w-4" /></button>
      <span className="w-6 text-center tabular-nums">{u.sel[c.id] ?? 0}</span>
      <button onClick={() => u.adjust(c.id, 1)} className="grid h-9 w-9 place-items-center rounded-full border"><Plus className="h-4 w-4" /></button>
    </div>
  );
}

// ── A · Bredare ──────────────────────────────────────────────────────────────
// Phone Samling B, wider: sticky header on one line, 8 Cards per row, Card
// names under each Card. Upgrade's full-screen list becomes a large dialog
// with the Duplicates as a grid of steppers.

function SamlingA() {
  const s = useStore();
  const v = useSamling();
  const p = useProgress(v.col);
  const u = useUpgrade(v.col);
  return (
    <div>
      <div className="sticky top-14 z-10 border-b bg-white">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-6 py-3">
          <select value={v.col} onChange={(e) => v.setCol(e.target.value)} className="h-10 rounded-lg border px-2 text-sm font-medium">{collections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          <div className="w-64"><Bar value={p.have} total={p.total} /></div><span className="text-sm tabular-nums">{p.have}/{p.total}</span>
          <div className="flex-1" />
          <FilterChips filter={v.filter} setFilter={v.setFilter} />
          <SearchBox v={v} className="w-72" />
        </div>
      </div>
      <Page className="space-y-4">
        <Sections v={v} u={u} cols="grid-cols-8" onUpgrade={u.pick} named />
        <Milestones />
      </Page>
      <Sheet open={!!u.from} onClose={u.reset} full title={u.from ? `Uppgradera ${rarityLabel[u.from]}` : ""}>
        <div className="-m-4 flex h-full flex-col">
          <p className="px-4 pt-3 text-xs text-gray-500">Vi har valt dina största Dubbletter. Justera med − / +. Card med Behåll är inte valda.</p>
          <div className="grid flex-1 grid-cols-6 content-start gap-4 overflow-y-auto p-4">
            {u.dupes.map((c) => (
              <div key={c.id}>
                <CardThumb card={c} count={s.owned[c.id]} selected={(u.sel[c.id] ?? 0) > 0} dim={!u.sel[c.id]} onClick={() => u.adjust(c.id, u.sel[c.id] ? -99 : 99)} />
                <div className="mt-1 flex items-center justify-between">
                  <button onClick={() => u.adjust(c.id, -1)} className="grid h-8 w-8 place-items-center rounded-full border"><Minus className="h-3 w-3" /></button>
                  <span className="text-sm tabular-nums">{u.sel[c.id] ?? 0}</span>
                  <button onClick={() => u.adjust(c.id, 1)} className="grid h-8 w-8 place-items-center rounded-full border"><Plus className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
          <UpgradeFooter u={u} />
        </div>
      </Sheet>
    </div>
  );
}

// ── B · Sidopanel ────────────────────────────────────────────────────────────
// The sticky header turns into a left sidebar (Collections with progress,
// filters, search, jump to a Rarity, milestones). The Card sheet and Upgrade
// both open as a right side panel, so the grid stays in view.

function SamlingB() {
  const s = useStore();
  const v = useSamling();
  const u = useUpgrade(v.col);
  const p = useProgress(v.col);
  return (
    <Page className="grid grid-cols-[260px_1fr] items-start gap-6">
      <aside className="sticky top-20 space-y-5">
        <div className="space-y-1">
          {collections.map((c) => <CollectionNav key={c.id} id={c.id} label={c.label} active={c.id === v.col} onClick={() => v.setCol(c.id)} />)}
        </div>
        <SearchBox v={v} />
        <FilterChips filter={v.filter} setFilter={v.setFilter} />
        <div className="space-y-0.5">
          {ORDER.map((r) => p.rarity[r].total > 0 && (
            <a key={r} href={`#r-${r}`} className="flex h-9 items-center justify-between rounded-lg px-2 text-sm hover:bg-gray-100">
              <span className={rarityText[r]}>{rarityLabel[r]}</span><span className="tabular-nums text-gray-500">{p.rarity[r].have}/{p.rarity[r].total}</span>
            </a>
          ))}
        </div>
        <Milestones />
      </aside>
      <div className="space-y-4">
        {v.filter === "alla" && !v.q && <><Scoreboard p={p} /><TrophyShelf collectionId={v.col} owned={s.owned} cols="grid-cols-6" /></>}
        <Sections v={v} u={u} cols="grid-cols-6" onUpgrade={u.pick} noSpecial />
      </div>
      <Sheet open={!!u.from} onClose={u.reset} full title={u.from ? `Uppgradera ${rarityLabel[u.from]}` : ""}>
        <div className="-m-4 flex h-full flex-col">
          <div className="flex-1 divide-y overflow-y-auto px-4">{u.dupes.map((c) => <StepperRow key={c.id} c={c} u={u} />)}</div>
          <UpgradeFooter u={u} />
        </div>
      </Sheet>
    </Page>
  );
}

function CollectionNav({ id, label, active, onClick }: { id: string; label: string; active: boolean; onClick: () => void }) {
  const p = useProgress(id);
  return (
    <button onClick={onClick} className={`block w-full rounded-lg p-2 text-left ${active ? "bg-purple-50 ring-1 ring-purple-300" : "hover:bg-gray-100"}`}>
      <div className="mb-1 flex justify-between text-sm"><span className={active ? "font-semibold" : ""}>{label}</span><span className="tabular-nums text-gray-500">{p.have}/{p.total}</span></div>
      <Bar value={p.have} total={p.total} />
    </button>
  );
}

// ── C · Instrument ───────────────────────────────────────────────────────────
// A right rail summarises the Collection (per-Rarity bars, Upgrade readiness,
// milestones). Upgrade happens in place: the grid narrows to that Rarity's
// Duplicates with steppers on each Card, and the rail becomes the confirm bar.

function SamlingC() {
  const s = useStore();
  const v = useSamling();
  const p = useProgress(v.col);
  const u = useUpgrade(v.col);
  return (
    <Page className="grid grid-cols-[1fr_320px] items-start gap-6">
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <select value={v.col} onChange={(e) => v.setCol(e.target.value)} className="h-10 rounded-lg border bg-white px-2 text-sm font-medium">{collections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select>
          {!u.from && <><FilterChips filter={v.filter} setFilter={v.setFilter} /><SearchBox v={v} className="flex-1 bg-white" /></>}
          {u.from && <div className="flex-1 rounded-lg bg-purple-50 px-3 py-2 text-sm text-purple-900">Välj {rarityLabel[u.from]}-Dubbletter att uppgradera. Vi har förvalt dina största.</div>}
        </div>
        {u.from ? (
          <div className="grid grid-cols-6 gap-4 rounded-xl border bg-white p-4">
            {u.dupes.map((c) => (
              <div key={c.id}>
                <CardThumb card={c} count={s.owned[c.id]} selected={(u.sel[c.id] ?? 0) > 0} dim={!u.sel[c.id]} onClick={() => u.adjust(c.id, u.sel[c.id] ? -99 : 99)} />
                <div className="mt-1 flex items-center justify-between">
                  <button onClick={() => u.adjust(c.id, -1)} className="grid h-8 w-8 place-items-center rounded-full border"><Minus className="h-3 w-3" /></button>
                  <span className="text-sm tabular-nums">{u.sel[c.id] ?? 0}</span>
                  <button onClick={() => u.adjust(c.id, 1)} className="grid h-8 w-8 place-items-center rounded-full border"><Plus className="h-3 w-3" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : <Sections v={v} u={u} cols="grid-cols-6" onUpgrade={u.pick} named />}
      </div>
      <aside className="sticky top-20 space-y-4">
        {u.from ? (
          <div className="overflow-hidden rounded-xl border bg-white">
            <div className="flex items-center justify-between px-4 py-3"><b>Uppgradera {rarityLabel[u.from]}</b><button onClick={u.reset} className="text-sm text-gray-500">Avbryt</button></div>
            <UpgradeFooter u={u} />
          </div>
        ) : (
          <>
            <div className="rounded-xl border bg-white p-4">
              <div className="flex items-baseline justify-between"><span className="text-2xl font-semibold tabular-nums">{p.have}<span className="text-base text-gray-400"> / {p.total}</span></span><span className="text-sm text-gray-500">samlade</span></div>
              <div className="mt-3 space-y-2">
                {ORDER.filter((r) => p.rarity[r].total).map((r) => (
                  <div key={r} className="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-xs"><span className={rarityText[r]}>{rarityLabel[r]}</span><Bar value={p.rarity[r].have} total={p.rarity[r].total} className={rarityBg[r]} /><span className="text-right tabular-nums">{p.rarity[r].have}/{p.rarity[r].total}</span></div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border bg-white p-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Uppgradera</div>
              {(["common", "rare", "epic"] as CardRarity[]).map((r) => {
                const rl = upgradeRule[r]!; const have = u.available(r);
                return (
                  <button key={r} onClick={() => u.pick(r)} className="block w-full rounded-lg p-2 text-left hover:bg-gray-50">
                    <div className="mb-1 flex justify-between text-sm"><span>{rarityLabel[r]} → {rarityLabel[rl.to]}</span><span className={`tabular-nums ${have >= rl.cost ? "font-semibold text-green-700" : "text-gray-500"}`}>{have}/{rl.cost}</span></div>
                    <Bar value={Math.min(have, rl.cost)} total={rl.cost} className={have >= rl.cost ? "bg-green-500" : undefined} />
                  </button>
                );
              })}
            </div>
            <div className="rounded-xl border bg-white p-4"><div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Prestationer</div><Milestones /></div>
          </>
        )}
      </aside>
    </Page>
  );
}

export const samlingDesktop = {
  A: { name: "Bredare", sheet: "dialog" as const, C: SamlingA },
  B: { name: "Sidopanel", sheet: "side" as const, C: SamlingB },
  C: { name: "Instrument", sheet: "dialog" as const, C: SamlingC },
};
