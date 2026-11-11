// PROTOTYPE — throwaway. Three layouts for Hem. Same structure (decided in the
// IA ticket): Daily claim + Streak, Väntar på dig, Collection progress, Event
// banner, Weekly goals, Topplista. They differ in density and hierarchy.

import { useState } from "react";
import { ChevronDown, ChevronRight, Gift, Repeat, Sparkles, Trophy } from "lucide-react";
import { activeEvent, collections, fmtMin, otherPlayers, weeklyGoals } from "./data";
import { Bar, Sheet, SectionTitle, useActions, useProgress, useStore } from "./kit";
import { Empty } from "./Baren";

export type WaitItem = { id: string; icon: string; title: string; sub?: string; cta: string; act: () => void };

export function useWaiting(): WaitItem[] {
  const s = useStore();
  const a = useActions();
  const items: WaitItem[] = [];
  for (const t of s.trades) items.push({ id: t.id, icon: "⇄", title: `Byte från ${t.from.name}`, sub: `Går ut om ${t.expiresInDays} d`, cta: "Visa", act: () => s.go("byte") });
  for (const c of s.chests) if (c.readyInMin === 0) items.push({ id: c.id, icon: "🧰", title: "Kista klar – hämta", sub: c.label, cta: "Hämta", act: () => a.collectChest(c.id) });
  for (const g of weeklyGoals) if (g.progress >= g.target && !s.goalsClaimed.has(g.id)) items.push({ id: g.id, icon: "🎯", title: g.label, sub: `Veckomål klart · +${g.reward} 💎`, cta: "Hämta", act: () => a.claimGoal(g.id) });
  if (!s.giftClaimed) items.push({ id: "gift", icon: "🎁", title: `${activeEvent.name}: inloggningsgåva`, sub: `+${activeEvent.gift} 💎`, cta: "Hämta", act: a.claimGift });
  items.push({ id: "ach", icon: "🏅", title: "Prestation: första Epic i SM 21-25", sub: "+150 💎", cta: "Hämta", act: () => s.say("Prestation: +150 💎") });
  return items;
}

export function StreakTrack({ step, compact }: { step: number; compact?: boolean }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 7 }, (_, i) => (
        <div key={i} className={`grid flex-1 place-items-center rounded-md ${compact ? "h-2" : "h-8 text-xs font-semibold"} ${i < step ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white" : "bg-gray-100 text-gray-400"} ${i === 6 && !compact ? "ring-1 ring-amber-400" : ""}`}>
          {!compact && (i === 6 ? "🎁" : i + 1)}
        </div>
      ))}
    </div>
  );
}

export function EventSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onClose={onClose} title={`Event: ${activeEvent.name}`}>
      <p className="text-sm text-gray-600">Slutar om <b>{activeEvent.endsIn}</b></p>
      <ul className="mt-3 space-y-2 text-sm">
        <li className="rounded-lg bg-purple-50 p-3">🎁 Inloggningsgåva: +{activeEvent.gift} 💎 per dag</li>
        <li className="rounded-lg bg-purple-50 p-3">💎 Dagliga Diamonds ×2 under eventet</li>
        <li className="rounded-lg bg-purple-50 p-3">🧰 Guldkistor 20 % billigare i Butik</li>
      </ul>
    </Sheet>
  );
}

export function liveCollections() {
  return collections;
}

export function TopRows({ n = 3 }: { n?: number }) {
  return (
    <>
      {otherPlayers.slice(0, n).map((p) => (
        <div key={p.id} className="flex h-9 items-center justify-between text-sm">
          <span><span className="inline-block w-6 text-gray-400">{p.rank}.</span>{p.name}</span>
          <span className="tabular-nums text-amber-700">{p.legendaries} Legendary</span>
        </div>
      ))}
      <div className="flex h-9 items-center justify-between rounded-md bg-purple-50 px-2 text-sm font-medium">
        <span><span className="inline-block w-6 text-gray-400">14.</span>Du</span><span className="tabular-nums text-amber-700">2 Legendary</span>
      </div>
    </>
  );
}

export function ProgressRow({ id, label }: { id: string; label: string }) {
  const p = useProgress(id);
  const s = useStore();
  return (
    <button onClick={() => s.go("samling")} className="block w-full py-2 text-left">
      <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="tabular-nums text-gray-600">{p.have} / {p.total}</span></div>
      <Bar value={p.have} total={p.total} />
    </button>
  );
}

// ── A: Lista ─────────────────────────────────────────────────────────────────
// The decided order, each block its own card, roomy. Closest to today's Hem.

function HemA() {
  const s = useStore();
  const a = useActions();
  const waiting = useWaiting();
  const [ev, setEv] = useState(false);
  return (
    <div className="space-y-4 p-4">
      <div className="rounded-2xl border p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-gray-500">Dagliga Diamonds</div>
            <div className="text-2xl font-semibold">150 💎</div>
          </div>
          <button disabled={s.dailyClaimed} onClick={a.claimDaily} className="h-12 rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 px-5 font-medium text-white disabled:from-gray-300 disabled:to-gray-300">
            {s.dailyClaimed ? "Hämtat ✓" : "Hämta"}
          </button>
        </div>
        <div className="mt-4"><StreakTrack step={s.streakStep} /></div>
        <p className="mt-2 text-xs text-gray-500">Streak {s.streakStep}/7 · bonus 500 💎 vid steg 7. Missar du en dag pausas den.</p>
      </div>

      {waiting.length > 0 && (
        <section>
          <SectionTitle>Väntar på dig ({waiting.length})</SectionTitle>
          <div className="divide-y rounded-2xl border">
            {waiting.map((w) => (
              <div key={w.id} className="flex items-center gap-3 px-4 py-3">
                <span className="text-xl">{w.icon}</span>
                <div className="flex-1"><div className="text-sm font-medium">{w.title}</div>{w.sub && <div className="text-xs text-gray-500">{w.sub}</div>}</div>
                <button onClick={w.act} className="h-10 rounded-lg bg-purple-100 px-4 text-sm font-medium text-purple-800">{w.cta}</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="rounded-2xl border p-4">
        <SectionTitle>Dina samlingar</SectionTitle>
        {liveCollections().map((c) => <ProgressRow key={c.id} id={c.id} label={c.label} />)}
      </section>

      <button onClick={() => setEv(true)} className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 p-4 text-left text-white">
        <Sparkles className="h-6 w-6" />
        <div className="flex-1"><div className="font-semibold">{activeEvent.name} pågår</div><div className="text-sm text-white/80">Slutar om {activeEvent.endsIn}</div></div>
        <ChevronRight className="h-5 w-5" />
      </button>

      <section className="rounded-2xl border p-4">
        <SectionTitle right={<span className="text-xs text-gray-400">Nollställs måndag</span>}>Veckomål</SectionTitle>
        {weeklyGoals.filter((g) => g.progress < g.target).map((g) => (
          <div key={g.id} className="py-2">
            <div className="mb-1 flex justify-between text-sm"><span>{g.label}</span><span className="text-gray-500">{g.progress}/{g.target} · {g.reward} 💎</span></div>
            <Bar value={g.progress} total={g.target} className={g.progress >= g.target ? "bg-green-500" : undefined} />
          </div>
        ))}
      </section>

      <section className="rounded-2xl border p-4">
        <SectionTitle right={<button onClick={() => s.go("topplista")} className="text-sm text-purple-700">Visa alla</button>}>Topplista</SectionTitle>
        <TopRows />
      </section>
      <EventSheet open={ev} onClose={() => setEv(false)} />
    </div>
  );
}

// ── B: Kompakt ───────────────────────────────────────────────────────────────
// Dashboard density: everything above the fold on a 390×844 screen.
// Väntar på dig as a horizontal strip; progress and goals as tiles.

export function Ring({ have, total, label }: { have: number; total: number; label: string }) {
  const pct = total ? have / total : 0;
  const r = 26, c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <svg width="68" height="68" viewBox="0 0 68 68">
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--surf2)" strokeWidth="7" />
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--text)" strokeWidth="7" strokeDasharray={`${pct * c} ${c}`} strokeLinecap="round" transform="rotate(-90 34 34)" />
                <text x="34" y="38" textAnchor="middle" className="fill-gray-900 font-display text-[15px]">{Math.round(pct * 100)}%</text>
      </svg>
      <div className="text-xs font-medium">{label}</div>
      <div className="text-[11px] tabular-nums text-gray-500">{have}/{total}</div>
    </div>
  );
}

export function RingFor({ id, label }: { id: string; label: string }) {
  const p = useProgress(id);
  const s = useStore();
  return <button onClick={() => s.go("samling")}><Ring have={p.have} total={p.total} label={label} /></button>;
}

function HemB() {
  const s = useStore();
  const a = useActions();
  const waiting = useWaiting();
  const [ev, setEv] = useState(false);
  return (
    <div className="space-y-3 p-3">
      <div className="flex items-center gap-3 rounded-xl bg-gray-50 p-3">
        <div className="flex-1">
          <div className="mb-1.5 flex justify-between text-xs text-gray-500"><span>Streak {s.streakStep}/7</span><span>🎁 500 vid 7</span></div>
          <StreakTrack step={s.streakStep} compact />
        </div>
        <button disabled={s.dailyClaimed} onClick={a.claimDaily} className="h-11 rounded-lg bg-gradient-to-r from-purple-600 to-blue-600 px-3 text-sm font-medium text-white disabled:from-gray-300 disabled:to-gray-300">
          {s.dailyClaimed ? "✓" : "+150 💎"}
        </button>
      </div>

      {waiting.length === 0 && <Empty icon="☕" title="Allt hämtat för idag" body="Kom tillbaka imorgon för dagens diamanter." />}
      {waiting.length > 0 && (
        <section>
          <div className="mb-1.5 flex items-baseline gap-2 px-1"><span className="font-display text-xl italic">Väntar på dig</span><span className="text-sm text-gray-500">{waiting.length}</span></div>
          <div className="-mx-3 flex snap-x gap-2 overflow-x-auto px-3 pb-1">
            {waiting.map((w) => (
              <button key={w.id} onClick={w.act} className="w-36 shrink-0 snap-start rounded-xl border border-purple-200 bg-purple-50 p-3 text-left">
                <div className="text-xl">{w.icon}</div>
                <div className="mt-1 line-clamp-2 text-xs font-medium leading-tight">{w.title}</div>
                <div className="mt-2 text-xs font-semibold text-purple-700">{w.cta} ›</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="flex justify-around rounded-xl border py-3">
        {liveCollections().map((c) => <RingFor key={c.id} id={c.id} label={c.shortLabel ?? c.label} />)}
      </section>

      <button onClick={() => setEv(true)} className="flex h-12 w-full items-center gap-2 rounded-xl border border-purple-300 bg-white px-3 text-sm">
        <Sparkles className="h-4 w-4 text-purple-700" /><span className="text-[11px] font-bold uppercase tracking-widest text-purple-700">Event</span><b className="font-display text-base">{activeEvent.name}</b><span className="text-white/80">· {activeEvent.endsIn} kvar</span><ChevronRight className="ml-auto h-4 w-4" />
      </button>

      <section className="grid grid-cols-3 gap-2">
        {weeklyGoals.map((g) => (
          <div key={g.id} className="rounded-xl border p-2">
            <div className="text-[11px] leading-tight">{g.label}</div>
            <div className="mt-1 text-sm font-semibold tabular-nums">{g.progress}/{g.target}</div>
            <Bar value={g.progress} total={g.target} className="bg-green-500" />
          </div>
        ))}
      </section>

      <button onClick={() => s.go("topplista")} className="flex h-11 w-full items-center gap-2 rounded-xl border px-3 text-sm">
        <Trophy className="h-4 w-4 text-amber-600" /> Du är <b>#14</b> <span className="text-gray-500">· topp: {otherPlayers[0].name}, {otherPlayers[1].name}, {otherPlayers[2].name}</span>
      </button>
      <EventSheet open={ev} onClose={() => setEv(false)} />
    </div>
  );
}

// ── C: Nästa steg ────────────────────────────────────────────────────────────
// One big "do this now" card that walks through the claimables one at a time,
// then everything else as collapsible rows. Optimises for the 30-second visit.

function HemC() {
  const s = useStore();
  const a = useActions();
  const waiting = useWaiting();
  const [ev, setEv] = useState(false);
  const [open, setOpen] = useState<string | null>("samlingar");
  const next: WaitItem | null = !s.dailyClaimed
    ? { id: "daily", icon: "💎", title: "Dagens Diamonds", sub: `Streak ${s.streakStep}/7 → ${s.streakStep + 1}/7`, cta: "Hämta 150 💎", act: a.claimDaily }
    : waiting[0] ?? null;
  const rest = next?.id === "daily" ? waiting : waiting.slice(1);
  const Row = ({ id, title, right, children }: { id: string; title: string; right?: string; children: React.ReactNode }) => (
    <div className="border-b">
      <button onClick={() => setOpen(open === id ? null : id)} className="flex h-14 w-full items-center justify-between px-4 text-left">
        <span className="font-medium">{title}</span>
        <span className="flex items-center gap-2 text-sm text-gray-500">{right}<ChevronDown className={`h-4 w-4 transition ${open === id ? "rotate-180" : ""}`} /></span>
      </button>
      {open === id && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
  return (
    <div>
      <div className="p-4">
        {next ? (
          <div className="rounded-3xl bg-gradient-to-br from-purple-600 to-blue-600 p-6 text-center text-white shadow-lg">
            <div className="text-5xl">{next.icon}</div>
            <div className="mt-2 text-xl font-semibold">{next.title}</div>
            {next.sub && <div className="text-sm text-white/80">{next.sub}</div>}
            <button onClick={next.act} className="mt-5 h-12 w-full rounded-xl bg-white font-semibold text-purple-700">{next.cta}</button>
            {next.id === "daily" && <div className="mt-4"><StreakTrack step={s.streakStep} compact /></div>}
          </div>
        ) : (
          <div className="rounded-3xl border-2 border-dashed p-6 text-center text-gray-500">Allt hämtat för idag ✓<div className="text-sm">Nästa: Silverkista om {fmtMin(134)}</div></div>
        )}
        {rest.length > 0 && (
          <div className="mt-3 space-y-1">
            <div className="px-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Också klart att hämta</div>
            {rest.map((w) => (
              <button key={w.id} onClick={w.act} className="flex h-12 w-full items-center gap-3 rounded-xl bg-gray-50 px-3 text-left text-sm">
                <span>{w.icon}</span><span className="flex-1 truncate">{w.title}</span><span className="font-medium text-purple-700">{w.cta}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={() => setEv(true)} className="mx-4 mb-2 flex h-11 w-[calc(100%-2rem)] items-center gap-2 rounded-xl bg-amber-50 px-3 text-sm text-amber-900">
        <Gift className="h-4 w-4" /> {activeEvent.name} · {activeEvent.endsIn} kvar <ChevronRight className="ml-auto h-4 w-4" />
      </button>
      <div className="border-t">
        <Row id="samlingar" title="Dina samlingar" right={liveCollections().map((c) => c.shortLabel).join(" · ")}>
          {liveCollections().map((c) => <ProgressRow key={c.id} id={c.id} label={c.label} />)}
        </Row>
        <Row id="mal" title="Veckomål" right={`${weeklyGoals.filter((g) => g.progress >= g.target).length}/${weeklyGoals.length}`}>
          {weeklyGoals.map((g) => (
            <div key={g.id} className="flex h-10 items-center justify-between text-sm"><span>{g.progress >= g.target ? "✅" : "⬜️"} {g.label}</span><span className="text-gray-500">{g.progress}/{g.target}</span></div>
          ))}
        </Row>
        <Row id="topp" title="Topplista" right="#14"><TopRows /></Row>
        <Row id="byten" title="Byten" right={`${s.trades.length} nya`}>
          <button onClick={() => s.go("byte")} className="flex h-10 items-center gap-2 text-sm text-purple-700"><Repeat className="h-4 w-4" /> Gå till Byte</button>
        </Row>
      </div>
      <EventSheet open={ev} onClose={() => setEv(false)} />
    </div>
  );
}

export const hemVariants = { A: { name: "Lista", C: HemA }, B: { name: "Kompakt", C: HemB }, C: { name: "Nästa steg", C: HemC } };
