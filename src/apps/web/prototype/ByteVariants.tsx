// PROTOTYPE — throwaway. Three layouts for Byte: Matchningar (default tab) and
// the one Trade builder. Mina byten and Sök spelare are shared and plain.
// Rules from the trading ticket: Ny!/Har redan badges on every Copy, Rarity
// totals side by side, Diamonds as a plain extra line, nothing blocked.

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, Search } from "lucide-react";
import {
  availableCount, cards, computeMatches, otherPlayers, rarityLabel, sortCards, type CardRarity, type DanceCard, type Match, type OtherPlayer,
} from "./data";
import { CardThumb, NewBadge, Sheet, useStore } from "./kit";

// ── Shared ───────────────────────────────────────────────────────────────────

export function totals(list: DanceCard[]) {
  const by: Partial<Record<CardRarity, number>> = {};
  list.forEach((c) => { by[c.rarity] = (by[c.rarity] ?? 0) + 1; });
  const order: CardRarity[] = ["special", "legendary", "epic", "rare", "common"];
  const parts = order.filter((r) => by[r]).map((r) => `${by[r]} ${rarityLabel[r]}`);
  return parts.length ? parts.join(" + ") : "inget";
}

export function useBuilder() {
  const s = useStore();
  const seed = s.builder!;
  const them = otherPlayers.find((p) => p.id === seed.playerId)!;
  const [get, setGet] = useState<string[]>(seed.requestCardId ? [seed.requestCardId] : []);
  const [give, setGive] = useState<string[]>([]);
  const [diamonds, setDiamonds] = useState(0);
  // Their side: available first (Duplicates), then "Inte till byte" (only Copy).
  const theirs = useMemo(() => {
    const owned = cards.filter((c) => them.owned[c.id]);
    const missingFirst = (c: DanceCard) => (s.owned[c.id] ? 1 : 0);
    return sortCards(owned).sort((a, b) => missingFirst(a) - missingFirst(b) || Number(them.owned[b.id] > 1) - Number(them.owned[a.id] > 1));
  }, [them, s.owned]);
  // My side: suggestions (they miss it) first.
  const mine = useMemo(() => {
    const owned = cards.filter((c) => availableCount(s.owned, s.keep, c.id) > 0);
    return sortCards(owned).sort((a, b) => Number(!!them.owned[a.id]) - Number(!!them.owned[b.id]));
  }, [s.owned, s.keep, them]);
  const toggle = (arr: string[], set: (v: string[]) => void, id: string) => set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);
  const send = () => { s.set({ builder: null }); s.say(`Bytesförslag skickat till ${them.name}`); };
  const getCards = get.map((id) => cards.find((c) => c.id === id)!);
  const giveCards = give.map((id) => cards.find((c) => c.id === id)!);
  return { them, get, give, theirs, mine, diamonds, setDiamonds, getCards, giveCards, toggleGet: (id: string) => toggle(get, setGet, id), toggleGive: (id: string) => toggle(give, setGive, id), send, close: () => s.set({ builder: null }) };
}
export type B = ReturnType<typeof useBuilder>;

export function TheirBadge({ c }: { b: B; c: DanceCard }) {
  const s = useStore();
  return <NewBadge isNew={!s.owned[c.id]} have={s.owned[c.id]} />;
}
export function MyBadge({ b, c }: { b: B; c: DanceCard }) {
  return <NewBadge isNew={!b.them.owned[c.id]} have={b.them.owned[c.id]} />;
}
export function NotForTrade({ b, c }: { b: B; c: DanceCard }) {
  return (b.them.owned[c.id] ?? 0) < 2 ? <div className="text-[10px] text-red-600">Inte till byte</div> : null;
}

export function Summary({ b, sticky = true }: { b: B; sticky?: boolean }) {
  return (
    <div className={`${sticky ? "sticky bottom-14 z-20" : ""} border-t bg-white p-3 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]`}>
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-center text-sm">
        <div><div className="text-[11px] text-gray-500">Du ger</div><div className="font-medium">{totals(b.giveCards)}</div>{b.diamonds > 0 && <div className="text-xs">+ {b.diamonds} 💎</div>}</div>
        <span className="text-lg text-gray-400">⇄</span>
        <div><div className="text-[11px] text-gray-500">Du får</div><div className="font-medium">{totals(b.getCards)}</div></div>
      </div>
      <button disabled={!b.get.length && !b.give.length} onClick={b.send} className="mt-3 h-12 w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 font-medium text-white disabled:from-gray-300 disabled:to-gray-300">Skicka förslag</button>
    </div>
  );
}

export function DiamondInput({ b }: { b: B }) {
  return (
    <label className="flex h-12 items-center justify-between rounded-xl border px-3 text-sm">
      <span>Lägg till Diamonds</span>
      <input type="number" min={0} step={50} value={b.diamonds || ""} placeholder="0" onChange={(e) => b.setDiamonds(Math.max(0, +e.target.value))} className="w-24 rounded-md bg-gray-100 px-2 py-1 text-right tabular-nums outline-none" />
    </label>
  );
}

function BuilderHeader({ b, title }: { b: B; title?: string }) {
  return (
    <div className="sticky top-12 z-20 flex h-12 items-center gap-2 border-b bg-white px-2">
      <button onClick={b.close} className="grid h-11 w-11 place-items-center"><ArrowLeft className="h-5 w-5" /></button>
      <span className="font-semibold">{title ?? `Nytt byte med ${b.them.name}`}</span>
    </div>
  );
}

export function MinaByten() {
  const s = useStore();
  return (
    <div className="space-y-4 p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Inkommande</div>
      {s.trades.map((t) => {
        const want = cards.filter((c) => (s.owned[c.id] ?? 0) > 1 && !t.from.owned[c.id]).slice(0, 2);
        const offer = cards.filter((c) => (t.from.owned[c.id] ?? 0) > 1 && !s.owned[c.id]).slice(0, 1);
        return (
          <div key={t.id} className="rounded-2xl border p-3">
            <div className="flex justify-between text-sm"><b>{t.from.name}</b><span className="text-gray-500">Går ut om {t.expiresInDays} d</span></div>
            <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <div className="grid grid-cols-2 gap-1">{want.map((c) => <CardThumb key={c.id} card={c} />)}</div>
              <span className="text-gray-400">⇄</span>
              <div className="grid grid-cols-2 gap-1">{offer.map((c) => <CardThumb key={c.id} card={c} owned badge={<NewBadge isNew />} />)}</div>
            </div>
            <div className="mt-1 text-center text-xs text-gray-600">{totals(want)} ⇄ {totals(offer)}</div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <button onClick={() => { s.set({ trades: s.trades.filter((x) => x.id !== t.id) }); s.say("Byte genomfört"); }} className="h-11 rounded-lg bg-green-600 text-sm font-medium text-white">Acceptera</button>
              <button onClick={() => s.set({ builder: { playerId: t.from.id } })} className="h-11 rounded-lg border text-sm">Motbud</button>
              <button onClick={() => s.set({ trades: s.trades.filter((x) => x.id !== t.id) })} className="h-11 rounded-lg border text-sm text-red-600">Avböj</button>
            </div>
          </div>
        );
      })}
      <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Utgående · 1 av max 10</div>
      <div className="flex h-14 items-center justify-between rounded-xl border px-3 text-sm"><span>Till {otherPlayers[7].name}</span><span className="text-gray-500">Väntar · 6 d kvar</span></div>
    </div>
  );
}

export function SokSpelare() {
  const s = useStore();
  const [q, setQ] = useState("");
  return (
    <div className="p-4">
      <div className="flex h-11 items-center gap-2 rounded-xl bg-gray-100 px-3"><Search className="h-4 w-4 text-gray-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Sök spelare" className="flex-1 bg-transparent outline-none" /></div>
      <div className="mt-2 divide-y">
        {otherPlayers.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => (
          <button key={p.id} onClick={() => s.set({ builder: { playerId: p.id } })} className="flex h-14 w-full items-center justify-between text-left text-sm">
            <span>{p.name}</span><span className="text-purple-700">Föreslå byte ›</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ByteShell({ Matchningar, Builder }: { Matchningar: () => JSX.Element; Builder: () => JSX.Element }) {
  const s = useStore();
  const [tab, setTab] = useState<"match" | "mina" | "sok">("match");
  if (s.builder) return <Builder />;
  return (
    <div>
      <div className="sticky top-12 z-10 grid grid-cols-3 border-b bg-white">
        {([["match", "Matchningar"], ["mina", "Mina byten"], ["sok", "Sök spelare"]] as const).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`relative h-12 text-sm ${tab === id ? "border-b-2 border-purple-600 font-semibold text-purple-700" : "text-gray-500"}`}>
            {label}{id === "mina" && s.trades.length > 0 && <span className="ml-1 rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">{s.trades.length}</span>}
          </button>
        ))}
      </div>
      {tab === "match" ? <Matchningar /> : tab === "mina" ? <MinaByten /> : <SokSpelare />}
    </div>
  );
}

export function useMatches() {
  const s = useStore();
  return useMemo(() => computeMatches(s.owned, s.keep), [s.owned, s.keep]);
}

// ── A: Rader + Staplad builder ───────────────────────────────────────────────

function MatchA() {
  const s = useStore();
  const m = useMatches();
  return (
    <div className="divide-y">
      {m.map(({ player, theyGive, iGive }) => (
        <button key={player.id} onClick={() => s.set({ builder: { playerId: player.id, requestCardId: theyGive[0]?.id } })} className="block w-full p-4 text-left">
          <div className="flex items-center justify-between"><b>{player.name}</b>{iGive.length > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800">Ni kan byta med varandra</span>}</div>
          <div className="mt-2 text-[11px] text-gray-500">Kan ge dig {theyGive.length}</div>
          <div className="mt-1 grid grid-cols-6 gap-1">{theyGive.slice(0, 6).map((c) => <CardThumb key={c.id} card={c} owned onClick={() => {}} />)}</div>
          {iGive.length > 0 && <div className="mt-2 text-[11px] text-gray-500">Du kan ge {iGive.length}: {totals(iGive.slice(0, 6))}{iGive.length > 6 ? "…" : ""}</div>}
        </button>
      ))}
    </div>
  );
}

function PickerGrid({ list, picked, onToggle, badge, extra }: { list: DanceCard[]; picked: string[]; onToggle: (id: string) => void; badge: (c: DanceCard) => JSX.Element; extra?: (c: DanceCard) => JSX.Element | null }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {list.map((c) => (
        <div key={c.id}>
          <CardThumb card={c} owned selected={picked.includes(c.id)} badge={badge(c)} onClick={() => onToggle(c.id)} />
          <div className="mt-1 truncate text-[11px]">{c.name}</div>{extra?.(c)}
        </div>
      ))}
    </div>
  );
}

function BuilderA() {
  const b = useBuilder();
  const [picker, setPicker] = useState<"get" | "give" | null>(null);
  const Side = ({ title, items, onAdd, badge }: { title: string; items: DanceCard[]; onAdd: () => void; badge: (c: DanceCard) => JSX.Element }) => (
    <section>
      <div className="mb-2 flex items-center justify-between"><span className="text-sm font-semibold">{title}</span><span className="text-xs text-gray-500">{totals(items)}</span></div>
      <div className="grid grid-cols-4 gap-2">
        {items.map((c) => <CardThumb key={c.id} card={c} owned badge={badge(c)} onClick={onAdd} />)}
        <button onClick={onAdd} className="grid aspect-[4/5] place-items-center rounded-lg border-2 border-dashed text-2xl text-gray-400">+</button>
      </div>
    </section>
  );
  return (
    <div>
      <BuilderHeader b={b} />
      <div className="space-y-6 p-4">
        <Side title={`Du får från ${b.them.name}`} items={b.getCards} onAdd={() => setPicker("get")} badge={(c) => <TheirBadge b={b} c={c} />} />
        <Side title="Du ger" items={b.giveCards} onAdd={() => setPicker("give")} badge={(c) => <MyBadge b={b} c={c} />} />
        <DiamondInput b={b} />
      </div>
      <Summary b={b} />
      <Sheet open={!!picker} onClose={() => setPicker(null)} full title={picker === "get" ? `${b.them.name}s Cards` : "Dina Dubbletter"}>
        {picker === "get"
          ? <PickerGrid list={b.theirs} picked={b.get} onToggle={b.toggleGet} badge={(c) => <TheirBadge b={b} c={c} />} extra={(c) => <NotForTrade b={b} c={c} />} />
          : <><p className="mb-3 text-xs text-gray-500">Först: Cards {b.them.name} saknar</p><PickerGrid list={b.mine} picked={b.give} onToggle={b.toggleGive} badge={(c) => <MyBadge b={b} c={c} />} /></>}
      </Sheet>
    </div>
  );
}

// ── B: Kompakt + Sida vid sida builder ───────────────────────────────────────

function MatchB() {
  const s = useStore();
  const m = useMatches();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div>
      <p className="px-4 py-2 text-xs text-gray-500">{m.length} spelare har Cards du saknar</p>
      {m.map(({ player, theyGive, iGive }) => (
        <div key={player.id} className="border-b">
          <button onClick={() => setOpen(open === player.id ? null : player.id)} className="flex h-14 w-full items-center gap-3 px-4 text-left">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-purple-200 to-blue-200 text-xs font-bold">{player.name[0]}</span>
            <span className="flex-1"><span className="block text-sm font-medium">{player.name} {iGive.length > 0 && <span className="text-green-700">⇄</span>}</span><span className="block text-xs text-gray-500">ger {theyGive.length} · tar {iGive.length}</span></span>
            <ChevronDown className={`h-4 w-4 text-gray-400 ${open === player.id ? "rotate-180" : ""}`} />
          </button>
          {open === player.id && (
            <div className="px-4 pb-4">
              <div className="grid grid-cols-5 gap-1">{theyGive.slice(0, 10).map((c) => <CardThumb key={c.id} card={c} owned onClick={() => s.set({ builder: { playerId: player.id, requestCardId: c.id } })} />)}</div>
              <button onClick={() => s.set({ builder: { playerId: player.id } })} className="mt-3 h-11 w-full rounded-xl border border-purple-300 text-sm font-medium text-purple-700">Föreslå byte</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function BuilderB() {
  const b = useBuilder();
  const s = useStore();
  const Col = ({ list, picked, onToggle, mineSide }: { list: DanceCard[]; picked: string[]; onToggle: (id: string) => void; mineSide: boolean }) => (
    <div className="min-w-0 space-y-1">
      {list.slice(0, 60).map((c) => {
        const on = picked.includes(c.id);
        const isNew = mineSide ? !b.them.owned[c.id] : !s.owned[c.id];
        return (
          <button key={c.id} onClick={() => onToggle(c.id)} className={`flex h-14 w-full items-center gap-1.5 rounded-lg border px-1.5 text-left ${on ? "border-green-500 bg-green-50" : ""}`}>
            <div className="w-8 shrink-0"><CardThumb card={c} owned onClick={() => onToggle(c.id)} /></div>
            <div className="min-w-0 flex-1"><div className="truncate text-[11px] leading-tight">{c.name}</div>
              <div className="text-[10px]">{isNew ? <span className="font-semibold text-green-700">Ny!</span> : <span className="text-gray-400">Har redan</span>}{!mineSide && (b.them.owned[c.id] ?? 0) < 2 && <span className="text-red-600"> · Inte till byte</span>}</div></div>
            {on && <Check className="h-4 w-4 shrink-0 text-green-600" />}
          </button>
        );
      })}
    </div>
  );
  return (
    <div>
      <BuilderHeader b={b} />
      <div className="sticky top-24 z-10 grid grid-cols-2 gap-2 border-b bg-white px-3 py-2 text-xs">
        <div><b>Du ger</b><div className="text-gray-500">{totals(b.giveCards)}</div></div>
        <div><b>{b.them.name} ger</b><div className="text-gray-500">{totals(b.getCards)}</div></div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        <Col list={b.mine} picked={b.give} onToggle={b.toggleGive} mineSide />
        <Col list={b.theirs} picked={b.get} onToggle={b.toggleGet} mineSide={false} />
      </div>
      <div className="px-3"><DiamondInput b={b} /></div>
      <Summary b={b} />
    </div>
  );
}

// ── C: Kortlek + Steg-för-steg builder ───────────────────────────────────────

function MatchC() {
  const s = useStore();
  const m = useMatches();
  const [i, setI] = useState(0);
  const cur: Match | undefined = m[i];
  if (!cur) return <p className="p-6 text-center text-gray-500">Inga matchningar just nu.</p>;
  return (
    <div className="p-4">
      <div className="mb-2 flex items-center justify-between text-xs text-gray-500"><span>Matchning {i + 1} av {m.length}</span><span>{cur.iGive.length > 0 ? "Ni kan byta med varandra" : "Envägs"}</span></div>
      <div className="rounded-3xl border p-4 shadow-sm">
        <div className="text-lg font-semibold">{cur.player.name}</div>
        <div className="mt-3 text-xs font-semibold uppercase text-gray-500">Har som du saknar</div>
        <div className="mt-1 grid grid-cols-3 gap-2">{cur.theyGive.slice(0, 6).map((c) => <CardThumb key={c.id} card={c} owned badge={<NewBadge isNew />} onClick={() => s.set({ builder: { playerId: cur.player.id, requestCardId: c.id } })} />)}</div>
        {cur.theyGive.length > 6 && <div className="mt-1 text-xs text-gray-500">+{cur.theyGive.length - 6} till</div>}
        <div className="mt-3 text-xs font-semibold uppercase text-gray-500">Saknar som du har dubbletter av</div>
        <div className="mt-1 text-sm">{cur.iGive.length ? totals(cur.iGive) : "Inget – erbjud Diamonds"}</div>
        <button onClick={() => s.set({ builder: { playerId: cur.player.id, requestCardId: cur.theyGive[0]?.id } })} className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 font-medium text-white">Föreslå byte</button>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button disabled={i === 0} onClick={() => setI(i - 1)} className="h-11 rounded-xl border text-sm disabled:opacity-40">‹ Föregående</button>
        <button disabled={i === m.length - 1} onClick={() => setI(i + 1)} className="h-11 rounded-xl border text-sm disabled:opacity-40">Nästa ›</button>
      </div>
    </div>
  );
}

function BuilderC() {
  const b = useBuilder();
  const [step, setStep] = useState(0);
  const steps = ["Du får", "Du ger", "Granska"];
  return (
    <div>
      <BuilderHeader b={b} />
      <div className="flex gap-1 px-4 pt-3">{steps.map((t, i) => <button key={t} onClick={() => setStep(i)} className={`flex-1 border-t-4 pt-1 text-left text-xs ${i <= step ? "border-purple-600 font-medium" : "border-gray-200 text-gray-400"}`}>{i + 1}. {t}</button>)}</div>
      <div className="p-4">
        {step === 0 && <PickerGrid list={b.theirs} picked={b.get} onToggle={b.toggleGet} badge={(c) => <TheirBadge b={b} c={c} />} extra={(c) => <NotForTrade b={b} c={c} />} />}
        {step === 1 && <><p className="mb-3 text-xs text-gray-500">Förslag först: Cards {b.them.name} saknar</p><PickerGrid list={b.mine} picked={b.give} onToggle={b.toggleGive} badge={(c) => <MyBadge b={b} c={c} />} /><div className="mt-4"><DiamondInput b={b} /></div></>}
        {step === 2 && (
          <div className="space-y-4">
            <div><div className="mb-1 text-sm font-semibold">Du får · {totals(b.getCards)}</div><div className="grid grid-cols-4 gap-2">{b.getCards.map((c) => <CardThumb key={c.id} card={c} owned badge={<TheirBadge b={b} c={c} />} />)}</div></div>
            <div><div className="mb-1 text-sm font-semibold">Du ger · {totals(b.giveCards)}{b.diamonds ? ` + ${b.diamonds} 💎` : ""}</div><div className="grid grid-cols-4 gap-2">{b.giveCards.map((c) => <CardThumb key={c.id} card={c} owned badge={<MyBadge b={b} c={c} />} />)}</div></div>
          </div>
        )}
      </div>
      {step < 2 ? (
        <div className="sticky bottom-14 border-t bg-white p-3"><div className="mb-2 text-center text-xs text-gray-500">{totals(b.giveCards)} ⇄ {totals(b.getCards)}</div><button onClick={() => setStep(step + 1)} className="h-12 w-full rounded-xl bg-gray-900 font-medium text-white">Nästa: {steps[step + 1]}</button></div>
      ) : <Summary b={b} />}
    </div>
  );
}

export const byteVariants = {
  A: { name: "Rader + staplad", C: () => <ByteShell Matchningar={MatchA} Builder={BuilderA} /> },
  B: { name: "Kompakt + sida vid sida", C: () => <ByteShell Matchningar={MatchB} Builder={BuilderB} /> },
  C: { name: "Kortlek + steg", C: () => <ByteShell Matchningar={MatchC} Builder={BuilderC} /> },
};
export type { OtherPlayer };
