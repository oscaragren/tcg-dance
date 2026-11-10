// PROTOTYPE — throwaway. Hem (phone pick: B · Kompakt) at desktop width.
// Same parts in every variant: Daily claim + Streak, Väntar på dig, Collection
// rings, Event banner, Weekly goals, Topplista. They differ in how they use width.

import { useState } from "react";
import { ChevronRight, Sparkles, Trophy } from "lucide-react";
import { activeEvent, otherPlayers, rarityBg, rarityLabel, weeklyGoals, type CardRarity } from "./data";
import { Bar, Page, SectionTitle, useActions, useProgress, useStore } from "./kit";
import { EventSheet, RingFor, StreakTrack, TopRows, liveCollections, useWaiting } from "./HemVariants";

function DailyRow() {
  const s = useStore();
  const a = useActions();
  return (
    <div className="flex items-center gap-4 rounded-xl border bg-white p-4">
      <div className="flex-1">
        <div className="mb-1.5 flex justify-between text-xs text-gray-500"><span>Streak {s.streakStep}/7</span><span>🎁 500 vid 7</span></div>
        <StreakTrack step={s.streakStep} compact />
      </div>
      <button disabled={s.dailyClaimed} onClick={a.claimDaily} className="h-11 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-4 text-sm font-medium text-white disabled:from-gray-300 disabled:to-gray-300">
        {s.dailyClaimed ? "Hämtat ✓" : "+150 💎"}
      </button>
    </div>
  );
}

function EventBanner({ onOpen }: { onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex h-12 w-full items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-4 text-sm text-white">
      <Sparkles className="h-4 w-4" /><b>{activeEvent.name}</b><span className="text-white/80">· {activeEvent.endsIn} kvar</span><ChevronRight className="ml-auto h-4 w-4" />
    </button>
  );
}

function GoalTile({ g }: { g: (typeof weeklyGoals)[number] }) {
  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="text-xs leading-tight">{g.label}</div>
      <div className="mt-1 text-sm font-semibold tabular-nums">{g.progress}/{g.target} <span className="font-normal text-gray-400">· {g.reward} 💎</span></div>
      <Bar value={g.progress} total={g.target} className="bg-green-500" />
    </div>
  );
}

// ── A · Bredare ──────────────────────────────────────────────────────────────
// Phone Hem B, one column at ~960px. The swipe strip becomes a wrapping row of
// tiles; nothing moves, nothing new.

function HemA() {
  const s = useStore();
  const waiting = useWaiting();
  const [ev, setEv] = useState(false);
  return (
    <Page className="max-w-[960px] space-y-4">
      <DailyRow />
      <section>
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Väntar på dig · {waiting.length}</div>
        <div className="grid grid-cols-5 gap-3">
          {waiting.map((w) => (
            <button key={w.id} onClick={w.act} className="rounded-xl border border-purple-200 bg-purple-50 p-3 text-left hover:border-purple-400">
              <div className="text-2xl">{w.icon}</div>
              <div className="mt-1 line-clamp-2 text-sm font-medium leading-tight">{w.title}</div>
              <div className="mt-2 text-xs font-semibold text-purple-700">{w.cta} ›</div>
            </button>
          ))}
        </div>
      </section>
      <section className="flex justify-around rounded-xl border bg-white py-4">
        {liveCollections().map((c) => <RingFor key={c.id} id={c.id} label={c.label} />)}
      </section>
      <EventBanner onOpen={() => setEv(true)} />
      <section className="grid grid-cols-3 gap-3">{weeklyGoals.map((g) => <GoalTile key={g.id} g={g} />)}</section>
      <button onClick={() => s.go("topplista")} className="flex h-12 w-full items-center gap-2 rounded-xl border bg-white px-4 text-sm">
        <Trophy className="h-4 w-4 text-amber-600" /> Du är <b>#14</b> <span className="text-gray-500">· topp: {otherPlayers.slice(0, 3).map((p) => p.name).join(", ")}</span>
      </button>
      <EventSheet open={ev} onClose={() => setEv(false)} />
    </Page>
  );
}

// ── B · Sidopanel ────────────────────────────────────────────────────────────
// Main column = the things you act on (claim, Väntar på dig as a list,
// progress). Right rail = things you glance at (Event, goals, Topplista).

function HemB() {
  const waiting = useWaiting();
  const [ev, setEv] = useState(false);
  return (
    <Page className="grid grid-cols-[1fr_340px] gap-6">
      <div className="space-y-4">
        <DailyRow />
        <section className="rounded-xl border bg-white">
          <div className="border-b px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Väntar på dig · {waiting.length}</div>
          {waiting.map((w) => (
            <div key={w.id} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
              <span className="text-xl">{w.icon}</span>
              <div className="flex-1"><div className="text-sm font-medium">{w.title}</div>{w.sub && <div className="text-xs text-gray-500">{w.sub}</div>}</div>
              <button onClick={w.act} className="h-9 rounded-lg bg-purple-100 px-4 text-sm font-medium text-purple-800 hover:bg-purple-200">{w.cta}</button>
            </div>
          ))}
        </section>
        <section className="flex justify-around rounded-xl border bg-white py-4">
          {liveCollections().map((c) => <RingFor key={c.id} id={c.id} label={c.label} />)}
        </section>
      </div>
      <aside className="space-y-4">
        <EventBanner onOpen={() => setEv(true)} />
        <section className="rounded-xl border bg-white p-4">
          <SectionTitle right={<span className="text-xs text-gray-400">Nollställs måndag</span>}>Veckomål</SectionTitle>
          {weeklyGoals.map((g) => (
            <div key={g.id} className="py-1.5">
              <div className="mb-1 flex justify-between text-sm"><span>{g.label}</span><span className="tabular-nums text-gray-500">{g.progress}/{g.target}</span></div>
              <Bar value={g.progress} total={g.target} className="bg-green-500" />
            </div>
          ))}
        </section>
        <section className="rounded-xl border bg-white p-4"><SectionTitle>Topplista</SectionTitle><TopRows n={5} /></section>
      </aside>
      <EventSheet open={ev} onClose={() => setEv(false)} />
    </Page>
  );
}

// ── C · Instrument ───────────────────────────────────────────────────────────
// A dashboard grid. Collection progress gets room to show per-Rarity bars
// (which the phone can't fit); everything is visible without scrolling.

function CollectionCard({ id, label }: { id: string; label: string }) {
  const p = useProgress(id);
  const s = useStore();
  const order: CardRarity[] = ["common", "rare", "epic", "legendary", "special"];
  return (
    <button onClick={() => s.go("samling")} className="rounded-xl border bg-white p-4 text-left hover:border-purple-300">
      <div className="flex items-baseline justify-between"><span className="font-semibold">{label}</span><span className="tabular-nums text-gray-600">{p.have}/{p.total}</span></div>
      <div className="mt-3 space-y-1.5">
        {order.filter((r) => p.rarity[r].total).map((r) => (
          <div key={r} className="grid grid-cols-[72px_1fr_44px] items-center gap-2 text-xs">
            <span className="text-gray-500">{rarityLabel[r]}</span><Bar value={p.rarity[r].have} total={p.rarity[r].total} className={rarityBg[r]} /><span className="text-right tabular-nums">{p.rarity[r].have}/{p.rarity[r].total}</span>
          </div>
        ))}
      </div>
    </button>
  );
}

function HemC() {
  const waiting = useWaiting();
  const [ev, setEv] = useState(false);
  return (
    <Page className="space-y-4">
      <EventBanner onOpen={() => setEv(true)} />
      <div className="grid grid-cols-12 gap-4">
        <div className="col-span-4 rounded-xl border bg-white p-4">
          <SectionTitle>Dagens</SectionTitle>
          <DailyRow />
          <div className="mt-4 grid grid-cols-1 gap-2">{weeklyGoals.map((g) => <GoalTile key={g.id} g={g} />)}</div>
        </div>
        <div className="col-span-8 rounded-xl border bg-white p-4">
          <SectionTitle>Väntar på dig · {waiting.length}</SectionTitle>
          <div className="grid grid-cols-3 gap-3">
            {waiting.map((w) => (
              <button key={w.id} onClick={w.act} className="flex items-center gap-3 rounded-xl border border-purple-200 bg-purple-50 p-3 text-left hover:border-purple-400">
                <span className="text-2xl">{w.icon}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{w.title}</span><span className="block text-xs text-purple-700">{w.cta} ›</span></span>
              </button>
            ))}
          </div>
        </div>
        <div className="col-span-8 grid grid-cols-2 gap-4">
          {liveCollections().map((c) => <CollectionCard key={c.id} id={c.id} label={c.label} />)}
        </div>
        <div className="col-span-4 rounded-xl border bg-white p-4"><SectionTitle>Topplista</SectionTitle><TopRows n={5} /></div>
      </div>
      <EventSheet open={ev} onClose={() => setEv(false)} />
    </Page>
  );
}

export const hemDesktop = {
  A: { name: "Bredare", sheet: "dialog" as const, C: HemA },
  B: { name: "Sidopanel", sheet: "side" as const, C: HemB },
  C: { name: "Instrument", sheet: "dialog" as const, C: HemC },
};
