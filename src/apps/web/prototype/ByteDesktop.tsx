// PROTOTYPE — throwaway. Byte (phone pick: A · Rader + staplad, plus filter by
// Collection and sort by name/Rarity) at desktop width. Same parts: Matchningar
// (default), Mina byten, Sök spelare, and the one Trade builder with Ny!/Har
// redan badges, Rarity totals side by side, Diamonds, nothing blocked.

import { useContext, useState, type ReactNode } from "react";
import { ArrowLeft, Repeat } from "lucide-react";
import { collections, rarityOrder, type DanceCard } from "./data";
import { CardThumb, Page, Sheet, SheetMode, useStore } from "./kit";
import {
  DiamondInput, MinaByten, MyBadge, NotForTrade, SokSpelare, Summary, TheirBadge, totals, useBuilder, useMatches, type B,
} from "./ByteVariants";

// ── Filter by Collection + sort by name/Rarity (added on the phone pick) ────

type Sort = "rarity" | "namn";
function useListControls() {
  const [col, setCol] = useState("alla");
  const [sort, setSort] = useState<Sort>("rarity");
  const apply = (list: DanceCard[]) => list
    .filter((c) => col === "alla" || c.collectionId === col)
    .slice()
    .sort((a, b) => sort === "namn" ? a.name.localeCompare(b.name, "sv") : rarityOrder[a.rarity] - rarityOrder[b.rarity] || a.name.localeCompare(b.name, "sv"));
  return { col, setCol, sort, setSort, apply };
}
type LC = ReturnType<typeof useListControls>;

function ListControls({ lc }: { lc: LC }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <select value={lc.col} onChange={(e) => lc.setCol(e.target.value)} className="h-9 rounded-lg border bg-white px-2">
        <option value="alla">Alla samlingar</option>{collections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
      </select>
      <div className="flex rounded-lg border bg-white p-0.5">
        {(["rarity", "namn"] as Sort[]).map((s) => <button key={s} onClick={() => lc.setSort(s)} className={`h-8 rounded-md px-3 ${lc.sort === s ? "bg-gray-900 text-white" : "text-gray-600"}`}>{s === "rarity" ? "Rarity" : "Namn"}</button>)}
      </div>
    </div>
  );
}

function Picker({ list, picked, onToggle, badge, extra, cols = "grid-cols-6" }: { list: DanceCard[]; picked: string[]; onToggle: (id: string) => void; badge: (c: DanceCard) => JSX.Element; extra?: (c: DanceCard) => JSX.Element | null; cols?: string }) {
  return (
    <div className={`grid ${cols} gap-3`}>
      {list.map((c) => (
        <div key={c.id}>
          <CardThumb card={c} owned selected={picked.includes(c.id)} badge={badge(c)} onClick={() => onToggle(c.id)} />
          <div className="mt-1 truncate text-[11px]">{c.name}</div>{extra?.(c)}
        </div>
      ))}
    </div>
  );
}

function Tabs({ tab, setTab }: { tab: string; setTab: (t: "match" | "mina" | "sok") => void }) {
  const s = useStore();
  return (
    <div className="flex gap-1 border-b">
      {([["match", "Matchningar"], ["mina", "Mina byten"], ["sok", "Sök spelare"]] as const).map(([id, label]) => (
        <button key={id} onClick={() => setTab(id)} className={`h-11 px-4 text-sm ${tab === id ? "border-b-2 border-purple-600 font-semibold text-purple-700" : "text-gray-500"}`}>
          {label}{id === "mina" && s.trades.length > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{s.trades.length}</span>}
        </button>
      ))}
    </div>
  );
}

function MatchRow({ m, lc, n = 10, active, compact }: { m: ReturnType<typeof useMatches>[number]; lc: LC; n?: number; active?: boolean; compact?: boolean }) {
  const s = useStore();
  const give = lc.apply(m.theyGive);
  return (
    <button onClick={() => s.set({ builder: { playerId: m.player.id, requestCardId: give[0]?.id } })} className={`block w-full rounded-xl border bg-white p-4 text-left hover:border-purple-300 ${active ? "border-purple-500 ring-1 ring-purple-500" : ""}`}>
      <div className="flex items-center justify-between"><b>{m.player.name}</b>{m.iGive.length > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">Ni kan byta med varandra</span>}</div>
      <div className="mt-2 text-[11px] text-gray-500">Kan ge dig {give.length}</div>
      <div className={`mt-1 grid ${compact ? "grid-cols-6" : "grid-cols-10"} gap-1`}>{give.slice(0, n).map((c) => <CardThumb key={c.id} card={c} owned onClick={() => {}} />)}</div>
      {m.iGive.length > 0 && <div className="mt-2 text-[11px] text-gray-500">Du kan ge {m.iGive.length}: {totals(m.iGive.slice(0, 6))}{m.iGive.length > 6 ? "…" : ""}</div>}
    </button>
  );
}

function Side({ title, items, onAdd, badge, cols = "grid-cols-6" }: { title: string; items: DanceCard[]; onAdd: () => void; badge: (c: DanceCard) => JSX.Element; cols?: string }) {
  return (
    <section className="rounded-xl border bg-white p-4">
      <div className="mb-3 flex items-center justify-between"><span className="font-semibold">{title}</span><span className="text-xs text-gray-500">{totals(items)}</span></div>
      <div className={`grid ${cols} gap-2`}>
        {items.map((c) => <CardThumb key={c.id} card={c} owned badge={badge(c)} onClick={onAdd} />)}
        <button onClick={onAdd} className="grid aspect-[4/5] place-items-center rounded-lg border-2 border-dashed text-2xl text-gray-400 hover:border-purple-400">+</button>
      </div>
    </section>
  );
}

/** Picker dialog shared by A and B: their Cards or my Duplicates, with list controls. */
function PickerDialog({ b, picker, close }: { b: B; picker: "get" | "give" | null; close: () => void }) {
  const lc = useListControls();
  const cols = useContext(SheetMode) === "side" ? "grid-cols-3" : "grid-cols-6";
  return (
    <Sheet open={!!picker} onClose={close} full title={picker === "get" ? `${b.them.name}s Cards` : "Dina Dubbletter"}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><ListControls lc={lc} />{picker === "give" && <span className="text-xs text-gray-500">Först: Cards {b.them.name} saknar</span>}</div>
      {picker === "get"
        ? <Picker cols={cols} list={lc.apply(b.theirs)} picked={b.get} onToggle={b.toggleGet} badge={(c) => <TheirBadge b={b} c={c} />} extra={(c) => <NotForTrade b={b} c={c} />} />
        : <Picker cols={cols} list={lc.sort === "rarity" && lc.col === "alla" ? b.mine : lc.apply(b.mine)} picked={b.give} onToggle={b.toggleGive} badge={(c) => <MyBadge b={b} c={c} />} />}
    </Sheet>
  );
}

function TabBody({ tab, Match }: { tab: string; Match: () => JSX.Element }) {
  return tab === "match" ? <Match /> : tab === "mina" ? <MinaByten /> : <SokSpelare />;
}

// ── A · Bredare ──────────────────────────────────────────────────────────────
// Phone Byte A, wider: Matchningar as a two-column grid of rows; the builder
// puts "Du får" and "Du ger" next to each other; pickers open as a big dialog.

function BuilderA() {
  const b = useBuilder();
  const [picker, setPicker] = useState<"get" | "give" | null>(null);
  return (
    <Page className="max-w-[1080px] space-y-4">
      <div className="flex items-center gap-2"><button onClick={b.close} className="grid h-10 w-10 place-items-center rounded-full hover:bg-gray-100"><ArrowLeft className="h-5 w-5" /></button><h1 className="text-lg font-semibold">Nytt byte med {b.them.name}</h1></div>
      <div className="grid grid-cols-2 gap-4">
        <Side title={`Du får från ${b.them.name}`} items={b.getCards} onAdd={() => setPicker("get")} badge={(c) => <TheirBadge b={b} c={c} />} />
        <Side title="Du ger" items={b.giveCards} onAdd={() => setPicker("give")} badge={(c) => <MyBadge b={b} c={c} />} />
      </div>
      <div className="grid grid-cols-2 gap-4"><div /><DiamondInput b={b} /></div>
      <div className="overflow-hidden rounded-xl border"><Summary b={b} sticky={false} /></div>
      <PickerDialog b={b} picker={picker} close={() => setPicker(null)} />
    </Page>
  );
}

function ByteA() {
  const s = useStore();
  const [tab, setTab] = useState<"match" | "mina" | "sok">("match");
  const m = useMatches();
  const lc = useListControls();
  if (s.builder) return <BuilderA />;
  const Match = () => (
    <div className="space-y-3">
      <div className="flex justify-end"><ListControls lc={lc} /></div>
      <div className="grid grid-cols-2 gap-3">{m.map((x) => <MatchRow key={x.player.id} m={x} lc={lc} />)}</div>
    </div>
  );
  return <Page className="max-w-[1080px] space-y-4"><Tabs tab={tab} setTab={setTab} /><TabBody tab={tab} Match={Match} /></Page>;
}

// ── B · Sidopanel ────────────────────────────────────────────────────────────
// List + detail: the tabs and Matchningar stay in a left column; the Trade
// builder opens beside them, so you can hop between players without leaving.

function BuilderPane() {
  const b = useBuilder();
  const [picker, setPicker] = useState<"get" | "give" | null>(null);
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold">Nytt byte med {b.them.name}</h2>
      <Side title={`Du får från ${b.them.name}`} items={b.getCards} onAdd={() => setPicker("get")} badge={(c) => <TheirBadge b={b} c={c} />} cols="grid-cols-7" />
      <Side title="Du ger" items={b.giveCards} onAdd={() => setPicker("give")} badge={(c) => <MyBadge b={b} c={c} />} cols="grid-cols-7" />
      <DiamondInput b={b} />
      <div className="overflow-hidden rounded-xl border"><Summary b={b} sticky={false} /></div>
      <PickerDialog b={b} picker={picker} close={() => setPicker(null)} />
    </div>
  );
}

function ByteB() {
  const s = useStore();
  const [tab, setTab] = useState<"match" | "mina" | "sok">("match");
  const m = useMatches();
  const lc = useListControls();
  const Match = () => (
    <div className="space-y-2">
      <ListControls lc={lc} />
      {m.map((x) => <MatchRow key={x.player.id} m={x} lc={lc} n={6} compact active={s.builder?.playerId === x.player.id} />)}
    </div>
  );
  return (
    <Page className="grid grid-cols-[420px_1fr] items-start gap-6">
      <div className="space-y-3"><Tabs tab={tab} setTab={setTab} /><TabBody tab={tab} Match={Match} /></div>
      <div className="sticky top-20">
        {s.builder ? <BuilderPane key={s.builder.playerId + (s.builder.requestCardId ?? "")} /> : (
          <div className="grid h-96 place-items-center rounded-xl border-2 border-dashed text-center text-gray-500"><div><Repeat className="mx-auto mb-2 h-8 w-8" />Välj en spelare till vänster för att föreslå ett byte</div></div>
        )}
      </div>
    </Page>
  );
}

// ── C · Instrument ───────────────────────────────────────────────────────────
// Matchningar as a dense table. The builder is three columns with no pickers
// to open: their Cards (left) and your Duplicates (right) are always visible,
// the Trade itself sits in the middle.

function Panel({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex max-h-[calc(100vh-9rem)] min-w-0 flex-col rounded-xl border bg-white">
      <div className="flex items-center justify-between border-b px-4 py-3"><span className="font-semibold">{title}</span>{right}</div>
      <div className="flex-1 overflow-y-auto p-4">{children}</div>
    </section>
  );
}

function BuilderC() {
  const b = useBuilder();
  const lcGet = useListControls();
  const lcGive = useListControls();
  return (
    <Page className="space-y-4">
      <div className="flex items-center gap-2"><button onClick={b.close} className="grid h-10 w-10 place-items-center rounded-full hover:bg-gray-100"><ArrowLeft className="h-5 w-5" /></button><h1 className="text-lg font-semibold">Nytt byte med {b.them.name}</h1></div>
      <div className="grid grid-cols-[1fr_340px_1fr] gap-4">
        <Panel title={`${b.them.name}s Cards`} right={<ListControls lc={lcGet} />}>
          <Picker cols="grid-cols-4" list={lcGet.apply(b.theirs)} picked={b.get} onToggle={b.toggleGet} badge={(c) => <TheirBadge b={b} c={c} />} extra={(c) => <NotForTrade b={b} c={c} />} />
        </Panel>
        <div className="space-y-3">
          <section className="rounded-xl border bg-white p-4"><div className="mb-2 text-sm font-semibold">Du får · {totals(b.getCards)}</div><div className="grid grid-cols-4 gap-2">{b.getCards.map((c) => <CardThumb key={c.id} card={c} owned badge={<TheirBadge b={b} c={c} />} onClick={() => b.toggleGet(c.id)} />)}</div>{!b.getCards.length && <p className="text-xs text-gray-400">Välj till vänster</p>}</section>
          <section className="rounded-xl border bg-white p-4"><div className="mb-2 text-sm font-semibold">Du ger · {totals(b.giveCards)}</div><div className="grid grid-cols-4 gap-2">{b.giveCards.map((c) => <CardThumb key={c.id} card={c} owned badge={<MyBadge b={b} c={c} />} onClick={() => b.toggleGive(c.id)} />)}</div>{!b.giveCards.length && <p className="text-xs text-gray-400">Välj till höger</p>}</section>
          <DiamondInput b={b} />
          <div className="overflow-hidden rounded-xl border"><Summary b={b} sticky={false} /></div>
        </div>
        <Panel title="Dina Dubbletter" right={<ListControls lc={lcGive} />}>
          <Picker cols="grid-cols-4" list={lcGive.apply(b.mine)} picked={b.give} onToggle={b.toggleGive} badge={(c) => <MyBadge b={b} c={c} />} />
        </Panel>
      </div>
    </Page>
  );
}

function ByteC() {
  const s = useStore();
  const [tab, setTab] = useState<"match" | "mina" | "sok">("match");
  const m = useMatches();
  const lc = useListControls();
  if (s.builder) return <BuilderC />;
  const Match = () => (
    <div className="overflow-hidden rounded-xl border bg-white">
      <div className="flex justify-end border-b p-2"><ListControls lc={lc} /></div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-2">Spelare</th><th>Kan ge dig</th><th className="w-[360px]" /><th>Du kan ge</th><th /></tr></thead>
        <tbody>
          {m.map(({ player, theyGive, iGive }) => {
            const give = lc.apply(theyGive);
            return (
              <tr key={player.id} className="border-t hover:bg-gray-50">
                <td className="px-4 py-2 font-medium">{player.name}{iGive.length > 0 && <span className="ml-2 text-green-700" title="Ni kan byta med varandra">⇄</span>}</td>
                <td className="tabular-nums">{give.length} · <span className="text-gray-500">{totals(give.slice(0, 20))}</span></td>
                <td><div className="grid grid-cols-8 gap-1 py-1">{give.slice(0, 8).map((c) => <CardThumb key={c.id} card={c} owned onClick={() => s.set({ builder: { playerId: player.id, requestCardId: c.id } })} />)}</div></td>
                <td className="tabular-nums text-gray-600">{iGive.length ? totals(iGive) : "—"}</td>
                <td className="pr-4 text-right"><button onClick={() => s.set({ builder: { playerId: player.id, requestCardId: give[0]?.id } })} className="h-9 rounded-lg border border-purple-300 px-3 font-medium text-purple-700 hover:bg-purple-50">Föreslå byte</button></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  return <Page className="space-y-4"><Tabs tab={tab} setTab={setTab} /><TabBody tab={tab} Match={Match} /></Page>;
}

export const byteDesktop = {
  A: { name: "Bredare", sheet: "dialog" as const, C: ByteA },
  B: { name: "Sidopanel", sheet: "side" as const, C: ByteB },
  C: { name: "Instrument", sheet: "dialog" as const, C: ByteC },
};
