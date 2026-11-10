// PROTOTYPE — throwaway. Shared shell for the key-screen prototype: in-memory
// store, top bar, bottom tab bar, Card thumb, bottom sheet, Card sheet and the
// floating variant switcher. Variants import from here but own their layouts.

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { Bell, ChevronLeft, ChevronRight, Gem, Home, Layers, Repeat, ShoppingBag, Trophy, User, X } from "lucide-react";
import { ImageWithFallback } from "../../../components/shared/figma/ImageWithFallback";
import { resolveCardDesignUrl } from "../../../data/cardDesignUrls";
import {
  availableCount, cards, incomingTrades, otherPlayers, initialChests, initialKeep, initialOwned, rarityFrame, rarityLabel,
  rarityText, weeklyGoals, type ChestSlot, type DanceCard,
} from "./data";

export type Screen = "hem" | "butik" | "samling" | "byte" | "topplista";

type BuilderSeed = { playerId: string; requestCardId?: string };

type Store = {
  diamonds: number;
  owned: Record<string, number>;
  keep: Set<string>;
  dailyClaimed: boolean;
  streakStep: number;
  chests: ChestSlot[];
  goalsClaimed: Set<string>;
  giftClaimed: boolean;
  trades: typeof incomingTrades;
  sheetCardId: string | null;
  builder: BuilderSeed | null;
  toast: string | null;
  set: (patch: Partial<Omit<Store, "set" | "go" | "say">>) => void;
  go: (screen: Screen) => void;
  say: (msg: string) => void;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => useContext(Ctx)!;

export function StoreProvider({ children, go }: { children: ReactNode; go: (s: Screen) => void }) {
  const [state, setState] = useState(() => ({
    diamonds: 1240,
    owned: initialOwned,
    keep: initialKeep,
    dailyClaimed: false,
    streakStep: 4,
    chests: initialChests,
    goalsClaimed: new Set<string>(),
    giftClaimed: false,
    trades: incomingTrades,
    sheetCardId: null as string | null,
    // ?byggare=p2 opens the Trade builder with that player (for sharing / screenshots).
    builder: (new URLSearchParams(window.location.search).get("byggare") ? { playerId: new URLSearchParams(window.location.search).get("byggare")! } : null) as BuilderSeed | null,
    toast: null as string | null,
  }));
  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => setState((s) => ({ ...s, toast: null })), 1800);
    return () => clearTimeout(t);
  }, [state.toast]);
  const value = useMemo<Store>(() => ({
    ...state,
    set: (patch) => setState((s) => ({ ...s, ...patch })),
    go,
    say: (toast) => setState((s) => ({ ...s, toast })),
  }), [state, go]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Shared actions so "Väntar på dig" and each item's home screen do the same thing. */
export function useActions() {
  const s = useStore();
  return {
    claimDaily() {
      if (s.dailyClaimed) return;
      const bonus = s.streakStep + 1 === 7 ? 500 : 0;
      s.set({ dailyClaimed: true, diamonds: s.diamonds + 150 + bonus, streakStep: (s.streakStep + 1) % 7 || 7 });
      s.say(`+${150 + bonus} 💎${bonus ? " (Streak-bonus!)" : ""}`);
    },
    collectChest(id: string) {
      s.set({ chests: s.chests.map((c) => (c.id === id ? { ...c, label: "", readyInMin: null } : c)), diamonds: s.diamonds + 2250 });
      s.say("Kista hämtad: +2 250 💎");
    },
    claimGoal(id: string) {
      const g = weeklyGoals.find((x) => x.id === id)!;
      s.set({ goalsClaimed: new Set([...s.goalsClaimed, id]), diamonds: s.diamonds + g.reward });
      s.say(`Veckomål: +${g.reward} 💎`);
    },
    claimGift() {
      s.set({ giftClaimed: true, diamonds: s.diamonds + 200 });
      s.say("Eventgåva: +200 💎");
    },
  };
}

export function useProgress(collectionId: string) {
  const { owned } = useStore();
  return useMemo(() => {
    const list = cards.filter((c) => c.collectionId === collectionId);
    const by = (r: string) => {
      const l = list.filter((c) => c.rarity === r);
      return { have: l.filter((c) => owned[c.id]).length, total: l.length };
    };
    return {
      have: list.filter((c) => owned[c.id]).length,
      total: list.length,
      rarity: { common: by("common"), rare: by("rare"), epic: by("epic"), legendary: by("legendary"), special: by("special") },
    };
  }, [owned, collectionId]);
}

// ── Frame ────────────────────────────────────────────────────────────────────

export function PhoneFrame({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100">
      <div className="relative mx-auto min-h-screen w-full max-w-[390px] bg-white pb-36 shadow-xl">{children}</div>
    </div>
  );
}

export function TopBar() {
  const { diamonds } = useStore();
  return (
    <div className="sticky top-0 z-30 flex h-12 items-center justify-between border-b bg-white/90 px-4 backdrop-blur">
      <span className="bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-lg font-semibold text-transparent">TCG Dance</span>
      <div className="flex items-center gap-1">
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-sm font-semibold tabular-nums text-blue-700">
          <Gem className="h-4 w-4" /> {diamonds.toLocaleString("sv-SE")}
        </span>
        <button className="relative grid h-11 w-11 place-items-center text-gray-600" aria-label="Notiser">
          <Bell className="h-5 w-5" />
          <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-red-500" />
        </button>
        <button className="grid h-11 w-11 place-items-center text-gray-600" aria-label="Profil"><User className="h-5 w-5" /></button>
      </div>
    </div>
  );
}

const TABS: { id: Screen; label: string; Icon: typeof Home }[] = [
  { id: "hem", label: "Hem", Icon: Home },
  { id: "butik", label: "Butik", Icon: ShoppingBag },
  { id: "samling", label: "Samling", Icon: Layers },
  { id: "byte", label: "Byte", Icon: Repeat },
  { id: "topplista", label: "Topplista", Icon: Trophy },
];

export function TabBar({ current }: { current: Screen }) {
  const s = useStore();
  const chestReady = s.chests.some((c) => c.readyInMin === 0);
  return (
    <nav className="fixed bottom-0 left-1/2 z-40 grid w-full max-w-[390px] -translate-x-1/2 grid-cols-5 border-t bg-white pb-[env(safe-area-inset-bottom)]">
      {TABS.map(({ id, label, Icon }) => {
        const active = id === current;
        return (
          <button key={id} onClick={() => s.go(id)} className={`relative flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] ${active ? "font-semibold text-purple-700" : "text-gray-500"}`}>
            <Icon className="h-5 w-5" />
            {label}
            {id === "byte" && s.trades.length > 0 && (
              <span className="absolute left-1/2 top-1.5 ml-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{s.trades.length}</span>
            )}
            {id === "butik" && chestReady && <span className="absolute left-1/2 top-2 ml-2 h-2 w-2 rounded-full bg-red-500" />}
          </button>
        );
      })}
    </nav>
  );
}

// ── Cards ────────────────────────────────────────────────────────────────────

export function CardThumb({ card, owned, count, badge, dim, selected, onClick, className = "" }: {
  card: DanceCard; owned?: boolean; count?: number; badge?: ReactNode; dim?: boolean; selected?: boolean;
  onClick?: () => void; className?: string;
}) {
  const s = useStore();
  const isOwned = owned ?? (s.owned[card.id] ?? 0) > 0;
  const url = isOwned ? resolveCardDesignUrl(card.designKey) : undefined;
  return (
    <button
      onClick={onClick ?? (() => s.set({ sheetCardId: card.id }))}
      className={`relative block aspect-[4/5] w-full rounded-lg p-0.5 text-left ${isOwned ? `bg-gradient-to-br ${rarityFrame[card.rarity]}` : "bg-gray-300"} ${dim ? "opacity-40" : ""} ${selected ? "ring-2 ring-green-500 ring-offset-2" : ""} ${className}`}
    >
      <div className="relative h-full w-full overflow-hidden rounded-[6px] bg-gray-800">
        {url ? <ImageWithFallback src={url} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
          : <div className="grid h-full place-items-center text-xl text-white/30">{isOwned ? "⚡" : "?"}</div>}
      </div>
      {count !== undefined && count > 1 && (
        <span className="absolute bottom-1 right-1 rounded-full bg-black/75 px-1.5 text-[10px] font-bold text-white">×{count}</span>
      )}
      {badge && <span className="absolute left-1 top-1">{badge}</span>}
    </button>
  );
}

export function NewBadge({ isNew, have }: { isNew: boolean; have?: number }) {
  return isNew
    ? <span className="rounded bg-green-500 px-1 text-[9px] font-bold text-white">Ny!</span>
    : <span className="rounded bg-gray-700/80 px-1 text-[9px] font-medium text-white">Har redan{have ? ` ×${have}` : ""}</span>;
}

export function RarityDot({ r }: { r: DanceCard["rarity"] }) {
  return <span className={`text-[10px] font-semibold uppercase tracking-wider ${rarityText[r]}`}>{rarityLabel[r]}</span>;
}

export function Bar({ value, total, className = "bg-gradient-to-r from-purple-600 to-blue-600" }: { value: number; total: number; className?: string }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-gray-100">
      <div className={`h-full rounded-full ${className}`} style={{ width: `${total ? (100 * value) / total : 0}%` }} />
    </div>
  );
}

// ── Sheets ───────────────────────────────────────────────────────────────────

export function Sheet({ open, onClose, children, title, full }: { open: boolean; onClose: () => void; children: ReactNode; title?: string; full?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-center">
      <button className="absolute inset-0 bg-black/40" onClick={onClose} aria-label="Stäng" />
      <div className={`absolute bottom-0 flex w-full max-w-[390px] flex-col rounded-t-2xl bg-white shadow-2xl ${full ? "top-6" : "max-h-[88vh]"}`}>
        <div className="flex items-center justify-between border-b px-4 py-2">
          <span className="font-semibold">{title}</span>
          <button onClick={onClose} className="grid h-11 w-11 place-items-center text-gray-500" aria-label="Stäng"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}

/** The one Card sheet: image, Rarity, Copies owned, Behåll, Hitta byte. */
export function CardSheet() {
  const s = useStore();
  const card = cards.find((c) => c.id === s.sheetCardId);
  const [finding, setFinding] = useState(false);
  useEffect(() => setFinding(false), [s.sheetCardId]);
  if (!card) return null;
  const n = s.owned[card.id] ?? 0;
  const kept = s.keep.has(card.id);
  const url = n ? resolveCardDesignUrl(card.designKey) : undefined;
  const holders = otherHolders(card.id);
  const close = () => s.set({ sheetCardId: null });
  return (
    <Sheet open onClose={close} title={card.name}>
      <div className="mx-auto w-56">
        <div className={`aspect-[4/5] rounded-xl p-1 ${n ? `bg-gradient-to-br ${rarityFrame[card.rarity]}` : "bg-gray-300"}`}>
          <div className="relative h-full overflow-hidden rounded-lg bg-gray-800">
            {url ? <ImageWithFallback src={url} alt={card.name} className="absolute inset-0 h-full w-full object-cover object-top" />
              : <div className="grid h-full place-items-center text-5xl text-white/25">?</div>}
          </div>
        </div>
      </div>
      <div className="mt-3 text-center">
        <RarityDot r={card.rarity} />
        <div className="text-xs text-gray-500">{[card.event, card.danceStyle, card.club].filter(Boolean).join(" · ")}</div>
        <div className="mt-1 text-sm">{n ? <>Du har <b>{n}</b> {n === 1 ? "Copy" : "Copies"}</> : <span className="text-gray-500">Du saknar detta Card</span>}</div>
      </div>
      {n > 1 && (
        <label className="mt-4 flex min-h-[48px] items-center justify-between rounded-xl border px-4">
          <span>
            <span className="block text-sm font-medium">Behåll</span>
            <span className="block text-xs text-gray-500">{kept ? "Dina Dubbletter syns inte för byte" : `${availableCount(s.owned, s.keep, card.id)} Dubbletter tillgängliga för byte`}</span>
          </span>
          <input type="checkbox" className="h-6 w-6 accent-purple-600" checked={kept}
            onChange={() => { const k = new Set(s.keep); kept ? k.delete(card.id) : k.add(card.id); s.set({ keep: k }); }} />
        </label>
      )}
      {n === 0 && !finding && (
        <button onClick={() => setFinding(true)} className="mt-4 h-12 w-full rounded-xl bg-gradient-to-r from-purple-600 to-blue-600 font-medium text-white">
          Hitta byte ({holders.length} spelare)
        </button>
      )}
      {finding && <HolderList cardId={card.id} onPick={(pid) => { s.set({ sheetCardId: null, builder: { playerId: pid, requestCardId: card.id } }); s.go("byte"); }} />}
    </Sheet>
  );
}

export function otherHolders(cardId: string) {
  return otherPlayers.filter((p) => (p.owned[cardId] ?? 0) > 1);
}

export function HolderList({ cardId, onPick }: { cardId: string; onPick: (playerId: string) => void }) {
  const holders = otherHolders(cardId);
  return (
    <div className="mt-4">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Har den tillgänglig</div>
      {holders.length === 0 && <p className="text-sm text-gray-500">Ingen har den tillgänglig just nu.</p>}
      {holders.map((p) => (
        <button key={p.id} onClick={() => onPick(p.id)} className="flex h-12 w-full items-center justify-between border-b text-left text-sm">
          <span>{p.name} <span className="text-gray-400">×{p.owned[cardId] - 1}</span></span>
          <span className="text-purple-700">Föreslå byte ›</span>
        </button>
      ))}
    </div>
  );
}

export function Toast() {
  const { toast } = useStore();
  if (!toast) return null;
  return <div className="fixed left-1/2 top-16 z-[60] -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</div>;
}

// ── Variant switcher (prototype chrome, not part of the design) ─────────────

export function VariantSwitcher({ keys, names, current, onChange }: { keys: string[]; names: Record<string, string>; current: string; onChange: (k: string) => void }) {
  const i = Math.max(0, keys.indexOf(current));
  const step = (d: number) => onChange(keys[(i + d + keys.length) % keys.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, [contenteditable]")) return;
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  return (
    <div className="fixed bottom-[68px] left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-yellow-300 bg-black px-1 py-1 font-mono text-xs text-yellow-200 shadow-xl">
      <button onClick={() => step(-1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" aria-label="Föregående variant"><ChevronLeft className="h-4 w-4" /></button>
      <span className="whitespace-nowrap px-1">{keys[i]} · {names[keys[i]]}</span>
      <button onClick={() => step(1)} className="grid h-8 w-8 place-items-center rounded-full hover:bg-white/10" aria-label="Nästa variant"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{children}</h2>
      {right}
    </div>
  );
}
