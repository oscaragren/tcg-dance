// PROTOTYPE — throwaway. Butik (phone pick: A · Skyltfönster) at desktop width.
// Same parts: a big Pack card per live Collection with fanned art, then Kistor
// (three slots + Chests to buy). Variants differ in how they use width.

import { Clock } from "lucide-react";
import { chestShop, collections, fmtMin } from "./data";
import { Page, SectionTitle, useActions, useStore } from "./kit";
import { ChestSlots, buyChest, coverArt, usePack } from "./ButikVariants";

function Fan({ id, h = "h-48", card = "h-40 w-28", spread = 72 }: { id: string; h?: string; card?: string; spread?: number }) {
  const art = coverArt(id);
  return (
    <div className={`relative flex ${h} items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100`}>
      {art.map((u, i) => (
        <img key={u} src={u} alt="" className={`absolute ${card} rounded-lg border-2 border-white object-cover object-top shadow-lg`} style={{ transform: `translateX(${(i - 1) * spread}px) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }} />
      ))}
    </div>
  );
}

function ShopRow({ c }: { c: (typeof chestShop)[number] }) {
  const s = useStore();
  return (
    <div className="flex items-center gap-3 rounded-xl border bg-white p-3">
      <span className="text-2xl">🧰</span>
      <div className="flex-1"><div className="text-sm font-medium">{c.label}</div><div className="text-xs text-gray-500">{c.hours} h · ger {c.payout}</div></div>
      <button onClick={() => buyChest(s, c.id)} className="h-10 rounded-lg border border-purple-300 px-3 text-sm font-medium text-purple-700 hover:bg-purple-50">{c.price} 💎</button>
    </div>
  );
}

// ── A · Bredare ──────────────────────────────────────────────────────────────
// Phone layout, wider: Pack cards side by side, Chest shop as three cards.

function ButikA() {
  const s = useStore();
  const { buy, sheet } = usePack();
  return (
    <Page className="max-w-[1080px] space-y-8">
      <section>
        <SectionTitle>Packs</SectionTitle>
        <div className="grid grid-cols-2 gap-4">
          {collections.map((c) => (
            <div key={c.id} className="overflow-hidden rounded-2xl border bg-white">
              <Fan id={c.id} />
              <div className="flex items-center justify-between p-4">
                <div><div className="font-semibold">{c.pack.label}</div><div className="text-sm text-gray-500">{c.pack.cardCount} Cards · {c.description}</div></div>
                <button onClick={() => buy(c.id)} className="h-12 shrink-0 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-5 font-medium text-white">{c.pack.price} 💎</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <section>
        <SectionTitle>Kistor</SectionTitle>
        <div className="grid grid-cols-[360px_1fr] gap-6">
          <ChestSlots />
          <div className="grid grid-cols-3 gap-3">
            {chestShop.map((c) => (
              <div key={c.id} className="flex flex-col items-center rounded-xl border bg-white p-4 text-center">
                <span className="text-4xl">🧰</span><div className="mt-1 font-medium">{c.label}</div><div className="text-xs text-gray-500">{c.hours} h · ger {c.payout}</div>
                <button onClick={() => buyChest(s, c.id)} className="mt-3 h-10 w-full rounded-lg border border-purple-300 text-sm font-medium text-purple-700 hover:bg-purple-50">{c.price} 💎</button>
              </div>
            ))}
          </div>
        </div>
      </section>
      {sheet}
    </Page>
  );
}

// ── B · Sidopanel ────────────────────────────────────────────────────────────
// Packs fill the main column; Kistor live in a sticky right rail, so a ready
// Chest is always in view while you buy Packs.

function ButikB() {
  const { buy, sheet } = usePack();
  const a = useActions();
  const s = useStore();
  return (
    <Page className="grid grid-cols-[1fr_360px] items-start gap-6">
      <section>
        <SectionTitle>Packs</SectionTitle>
        <div className="space-y-4">
          {collections.map((c) => (
            <div key={c.id} className="grid grid-cols-[320px_1fr] overflow-hidden rounded-2xl border bg-white">
              <Fan id={c.id} h="h-56" />
              <div className="flex flex-col justify-between p-6">
                <div><div className="text-lg font-semibold">{c.pack.label}</div><div className="mt-1 text-sm text-gray-500">{c.pack.cardCount} Cards per Pack</div><p className="mt-2 text-sm text-gray-600">{c.description}</p></div>
                <button onClick={() => buy(c.id)} className="mt-4 h-12 w-48 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 font-medium text-white">Köp · {c.pack.price} 💎</button>
              </div>
            </div>
          ))}
        </div>
      </section>
      <aside className="sticky top-20 space-y-3 rounded-2xl border bg-white p-4">
        <SectionTitle>Kistor</SectionTitle>
        {s.chests.map((c) => {
          const empty = c.readyInMin === null, ready = c.readyInMin === 0;
          return (
            <div key={c.id} className={`flex h-14 items-center gap-3 rounded-xl border px-3 ${ready ? "border-green-500 bg-green-50" : empty ? "border-dashed" : ""}`}>
              <span className="text-2xl">{empty ? "▫️" : "🧰"}</span>
              <div className="flex-1 text-sm">{empty ? <span className="text-gray-400">Tom plats</span> : <><div className="font-medium">{c.label}</div><div className="flex items-center gap-1 text-xs text-gray-500">{ready ? "Klar att hämta" : <><Clock className="h-3 w-3" />{fmtMin(c.readyInMin!)}</>}</div></>}</div>
              {ready && <button onClick={() => a.collectChest(c.id)} className="h-9 rounded-lg bg-green-600 px-3 text-sm font-medium text-white">Hämta</button>}
            </div>
          );
        })}
        <div className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Köp kista</div>
        {chestShop.map((c) => <ShopRow key={c.id} c={c} />)}
      </aside>
      {sheet}
    </Page>
  );
}

// ── C · Instrument ───────────────────────────────────────────────────────────
// Chest slots as a status strip across the top; below, one shelf where Packs
// and Chests to buy are the same kind of product tile.

function ButikC() {
  const s = useStore();
  const a = useActions();
  const { buy, sheet } = usePack();
  return (
    <Page className="space-y-6">
      <section className="grid grid-cols-3 gap-3">
        {s.chests.map((c, i) => {
          const empty = c.readyInMin === null, ready = c.readyInMin === 0;
          return (
            <div key={c.id} className={`flex h-16 items-center gap-3 rounded-xl border-2 bg-white px-4 ${ready ? "border-green-500" : empty ? "border-dashed" : "border-transparent"}`}>
              <span className="text-xs text-gray-400">Plats {i + 1}</span>
              <span className="text-2xl">{empty ? "" : "🧰"}</span>
              <div className="flex-1 text-sm">{empty ? <span className="text-gray-400">Tom – köp en kista nedan</span> : <><b>{c.label}</b><div className="text-xs text-gray-500">{ready ? "Klar!" : `Klar om ${fmtMin(c.readyInMin!)}`}</div></>}</div>
              {ready && <button onClick={() => a.collectChest(c.id)} className="h-10 rounded-lg bg-green-600 px-4 text-sm font-medium text-white">Hämta</button>}
            </div>
          );
        })}
      </section>
      <section className="grid grid-cols-4 gap-4">
        {collections.map((c) => (
          <div key={c.id} className="col-span-1 flex flex-col overflow-hidden rounded-2xl border bg-white">
            <Fan id={c.id} h="h-44" card="h-32 w-24" spread={44} />
            <div className="flex flex-1 flex-col p-4"><div className="text-xs font-semibold uppercase text-purple-700">Pack</div><div className="font-semibold">{c.label}</div><div className="flex-1 text-xs text-gray-500">{c.pack.cardCount} Cards</div>
              <button onClick={() => buy(c.id)} className="mt-3 h-11 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 text-sm font-medium text-white">{c.pack.price} 💎</button></div>
          </div>
        ))}
        {chestShop.map((c) => (
          <div key={c.id} className="flex flex-col overflow-hidden rounded-2xl border bg-white">
            <div className="grid h-44 place-items-center bg-gradient-to-br from-amber-50 to-amber-100 text-6xl">🧰</div>
            <div className="flex flex-1 flex-col p-4"><div className="text-xs font-semibold uppercase text-amber-700">Kista · {c.hours} h</div><div className="font-semibold">{c.label}</div><div className="flex-1 text-xs text-gray-500">ger {c.payout}</div>
              <button onClick={() => buyChest(s, c.id)} className="mt-3 h-11 rounded-xl border border-amber-400 text-sm font-medium text-amber-800 hover:bg-amber-50">{c.price} 💎</button></div>
          </div>
        ))}
      </section>
      {sheet}
    </Page>
  );
}

export const butikDesktop = {
  A: { name: "Bredare", sheet: "dialog" as const, C: ButikA },
  B: { name: "Sidopanel", sheet: "dialog" as const, C: ButikB },
  C: { name: "Instrument", sheet: "dialog" as const, C: ButikC },
};
