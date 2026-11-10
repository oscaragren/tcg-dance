// PROTOTYPE — throwaway. Three layouts for Butik: Packs (one per live
// Collection) then Kistor (slots, timers, collect, buy).

import { useState } from "react";
import { Clock } from "lucide-react";
import { chestShop, collections, fmtMin, randomPack, type DanceCard } from "./data";
import { CardThumb, NewBadge, Sheet, SectionTitle, useActions, useStore } from "./kit";
import { resolveCardDesignUrl } from "../../../data/cardDesignUrls";
import { cardsIn } from "./data";

export function usePack() {
  const s = useStore();
  const [opened, setOpened] = useState<{ cards: DanceCard[]; before: Record<string, number> } | null>(null);
  const buy = (collectionId: string) => {
    if (s.diamonds < 100) return s.say("Inte nog med Diamonds");
    const got = randomPack(collectionId);
    const owned = { ...s.owned };
    got.forEach((c) => { owned[c.id] = (owned[c.id] ?? 0) + 1; });
    setOpened({ cards: got, before: s.owned });
    s.set({ owned, diamonds: s.diamonds - 100 });
  };
  const sheet = (
    <Sheet open={!!opened} onClose={() => setOpened(null)} title="Ditt Pack">
      <div className="grid grid-cols-3 gap-3">
        {opened?.cards.map((c, i) => (
          <div key={i}>
            <CardThumb card={c} owned badge={<NewBadge isNew={!opened.before[c.id]} have={opened.before[c.id]} />} />
            <div className="mt-1 truncate text-[11px]">{c.name}</div>
          </div>
        ))}
      </div>
      <button onClick={() => setOpened(null)} className="mt-4 h-12 w-full rounded-xl bg-gray-900 font-medium text-white">Klart</button>
    </Sheet>
  );
  return { buy, sheet };
}

export function coverArt(collectionId: string, n = 3) {
  return cardsIn(collectionId).filter((c) => c.rarity === "legendary" || c.rarity === "epic").slice(0, n)
    .map((c) => resolveCardDesignUrl(c.designKey)).filter(Boolean) as string[];
}

export function ChestSlots({ compact }: { compact?: boolean }) {
  const s = useStore();
  const a = useActions();
  return (
    <div className={compact ? "space-y-2" : "grid grid-cols-3 gap-2"}>
      {s.chests.map((c) => {
        const empty = c.readyInMin === null;
        const ready = c.readyInMin === 0;
        if (compact) {
          return (
            <div key={c.id} className="flex h-14 items-center gap-3 rounded-xl border px-3">
              <span className="text-2xl">{empty ? "▫️" : "🧰"}</span>
              <div className="flex-1 text-sm">{empty ? <span className="text-gray-400">Tom plats</span> : <><div className="font-medium">{c.label}</div><div className="text-xs text-gray-500">{ready ? "Klar att hämta" : `Klar om ${fmtMin(c.readyInMin!)}`}</div></>}</div>
              {ready && <button onClick={() => a.collectChest(c.id)} className="h-10 rounded-lg bg-green-600 px-4 text-sm font-medium text-white">Hämta</button>}
            </div>
          );
        }
        return (
          <div key={c.id} className={`flex aspect-square flex-col items-center justify-center rounded-xl border-2 p-2 text-center ${ready ? "border-green-500 bg-green-50" : empty ? "border-dashed" : ""}`}>
            {empty ? <span className="text-xs text-gray-400">Tom plats</span> : (
              <>
                <span className="text-3xl">🧰</span>
                <span className="text-[11px] font-medium">{c.label}</span>
                {ready ? <button onClick={() => a.collectChest(c.id)} className="mt-1 h-8 rounded-md bg-green-600 px-3 text-xs font-medium text-white">Hämta</button>
                  : <span className="mt-1 flex items-center gap-1 text-[11px] text-gray-500"><Clock className="h-3 w-3" />{fmtMin(c.readyInMin!)}</span>}
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function buyChest(s: ReturnType<typeof useStore>, id: string) {
  const item = chestShop.find((c) => c.id === id)!;
  const free = s.chests.find((c) => c.readyInMin === null);
  if (!free) return s.say("Alla platser är fulla");
  if (s.diamonds < item.price) return s.say("Inte nog med Diamonds");
  s.set({ diamonds: s.diamonds - item.price, chests: s.chests.map((c) => (c.id === free.id ? { ...c, label: item.label, readyInMin: item.hours * 60 } : c)) });
  s.say(`${item.label} startad`);
}

// ── A: Skyltfönster ──────────────────────────────────────────────────────────

function ButikA() {
  const s = useStore();
  const { buy, sheet } = usePack();
  return (
    <div className="space-y-6 p-4">
      <section>
        <SectionTitle>Packs</SectionTitle>
        <div className="space-y-3">
          {collections.map((c) => {
            const art = coverArt(c.id);
            return (
              <div key={c.id} className="overflow-hidden rounded-2xl border">
                <div className="relative flex h-40 items-center justify-center bg-gradient-to-br from-purple-100 to-blue-100">
                  {art.map((u, i) => (
                    <img key={u} src={u} alt="" className="absolute h-32 w-24 rounded-lg border-2 border-white object-cover object-top shadow-lg" style={{ transform: `translateX(${(i - 1) * 56}px) rotate(${(i - 1) * 8}deg)`, zIndex: i === 1 ? 2 : 1 }} />
                  ))}
                </div>
                <div className="flex items-center justify-between p-4">
                  <div><div className="font-semibold">{c.pack.label}</div><div className="text-sm text-gray-500">{c.pack.cardCount} Cards · {c.description}</div></div>
                  <button onClick={() => buy(c.id)} className="h-12 shrink-0 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 font-medium text-white">{c.pack.price} 💎</button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
      <section>
        <SectionTitle>Kistor</SectionTitle>
        <ChestSlots />
        <div className="mt-4 space-y-2">
          {chestShop.map((c) => (
            <div key={c.id} className="flex items-center gap-3 rounded-xl border p-3">
              <span className="text-2xl">🧰</span>
              <div className="flex-1"><div className="text-sm font-medium">{c.label}</div><div className="text-xs text-gray-500">{c.hours} h · ger {c.payout}</div></div>
              <button onClick={() => buyChest(s, c.id)} className="h-10 rounded-lg border border-purple-300 px-3 text-sm font-medium text-purple-700">{c.price} 💎</button>
            </div>
          ))}
        </div>
      </section>
      {sheet}
    </div>
  );
}

// ── B: Flikar ────────────────────────────────────────────────────────────────
// Segmented control splits the screen; each half gets the full height.

function ButikB() {
  const s = useStore();
  const { buy, sheet } = usePack();
  const [tab, setTab] = useState<"packs" | "kistor">("packs");
  const ready = s.chests.some((c) => c.readyInMin === 0);
  return (
    <div className="p-4">
      <div className="sticky top-12 z-10 -mx-4 bg-white px-4 pb-3">
        <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1">
          {(["packs", "kistor"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`relative h-10 rounded-lg text-sm font-medium ${tab === t ? "bg-white shadow" : "text-gray-500"}`}>
              {t === "packs" ? "Packs" : "Kistor"}
              {t === "kistor" && ready && <span className="absolute right-6 top-3 h-2 w-2 rounded-full bg-red-500" />}
            </button>
          ))}
        </div>
      </div>
      {tab === "packs" ? (
        <div className="grid grid-cols-2 gap-3">
          {collections.map((c) => {
            const art = coverArt(c.id, 1)[0];
            return (
              <button key={c.id} onClick={() => buy(c.id)} className="overflow-hidden rounded-2xl border text-left">
                <div className="aspect-[4/5] bg-gray-800">{art && <img src={art} alt="" className="h-full w-full object-cover object-top" />}</div>
                <div className="p-3"><div className="text-sm font-semibold">{c.label}</div><div className="text-xs text-gray-500">{c.pack.cardCount} Cards</div>
                  <div className="mt-2 grid h-10 place-items-center rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 text-sm font-medium text-white">{c.pack.price} 💎</div>
                </div>
              </button>
            );
          })}
          <div className="overflow-hidden rounded-2xl border opacity-60">
            <div className="grid aspect-[4/5] place-items-center bg-gray-200 text-sm text-gray-500">(exempel)</div>
            <div className="p-3"><div className="text-sm font-semibold">Gammal samling</div><div className="mt-2 grid h-10 place-items-center rounded-lg bg-gray-200 text-sm font-medium text-gray-500">Slutsålt</div></div>
          </div>
        </div>
      ) : (
        <div>
          <ChestSlots compact />
          <div className="mt-5 text-xs font-semibold uppercase tracking-wide text-gray-500">Köp kista</div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {chestShop.map((c) => (
              <button key={c.id} onClick={() => buyChest(s, c.id)} className="rounded-xl border p-3 text-center">
                <div className="text-3xl">🧰</div><div className="text-xs font-medium">{c.label}</div><div className="text-[11px] text-gray-500">{c.hours} h</div>
                <div className="mt-2 text-sm font-semibold text-purple-700">{c.price} 💎</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {sheet}
    </div>
  );
}

// ── C: Kassalista ────────────────────────────────────────────────────────────
// One dense list, Kistor first when one is ready (state drives order).

function ButikC() {
  const s = useStore();
  const { buy, sheet } = usePack();
  const ready = s.chests.some((c) => c.readyInMin === 0);
  const packs = (
    <section key="p">
      <SectionTitle>Packs</SectionTitle>
      <div className="divide-y rounded-xl border">
        {collections.map((c) => (
          <div key={c.id} className="flex h-16 items-center gap-3 px-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-purple-500 to-blue-500 text-xs font-bold text-white">{c.shortLabel?.slice(0, 4)}</div>
            <div className="flex-1"><div className="text-sm font-medium">{c.pack.label}</div><div className="text-xs text-gray-500">{c.pack.cardCount} Cards</div></div>
            <button onClick={() => buy(c.id)} className="h-10 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 text-sm font-medium text-white">{c.pack.price} 💎</button>
          </div>
        ))}
        <div className="flex h-16 items-center gap-3 px-3 opacity-50">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gray-300 text-xs">—</div>
          <div className="flex-1 text-sm">Exempel: slutsåld samling</div>
          <span className="text-sm font-medium text-gray-500">Slutsålt</span>
        </div>
      </div>
    </section>
  );
  const kistor = (
    <section key="k">
      <SectionTitle right={ready ? <span className="text-xs font-semibold text-green-700">● Klar att hämta</span> : undefined}>Kistor</SectionTitle>
      <ChestSlots compact />
      <div className="mt-2 divide-y rounded-xl border">
        {chestShop.map((c) => (
          <div key={c.id} className="flex h-14 items-center gap-3 px-3 text-sm">
            <span className="flex-1">{c.label} <span className="text-gray-500">· {c.hours} h · {c.payout}</span></span>
            <button onClick={() => buyChest(s, c.id)} className="h-10 rounded-lg border px-3 font-medium">{c.price} 💎</button>
          </div>
        ))}
      </div>
    </section>
  );
  return <div className="space-y-5 p-4">{ready ? [kistor, packs] : [packs, kistor]}{sheet}</div>;
}

export const butikVariants = { A: { name: "Skyltfönster", C: ButikA }, B: { name: "Flikar", C: ButikB }, C: { name: "Kassalista", C: ButikC } };
