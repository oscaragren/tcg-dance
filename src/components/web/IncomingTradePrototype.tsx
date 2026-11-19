// PROTOTYPE (throwaway): where should Incoming Trades live on Hem now that they leave "Väntar på dig"?
// Three variants of the mobile Hem, switched with ?variant=A|B|C on the existing route "/".
// Nothing here accepts a Trade: every variant only links to /byte. Add &fake=0 to hide the fake trades.
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { WaitingItem } from "../../types/game";

export type ProtoTrade = { id: string; from: string; gives: number };

const VARIANTS = [
  { key: "A", name: "Banner ovanför" },
  { key: "B", name: "Rader per byte" },
  { key: "C", name: "Bara märke i headern" },
] as const;

const FAKE: ProtoTrade[] = [
  { id: "f1", from: "Anna", gives: 2 },
  { id: "f2", from: "Johan", gives: 1 },
];

/** Real Incoming Trades from the waiting list; two fake ones when there are none so the layout is judgeable. */
export function useProtoTrades(waiting: WaitingItem[]): { variant: string; trades: ProtoTrade[] } {
  const [params] = useSearchParams();
  const real: ProtoTrade[] = waiting.flatMap((i) =>
    i.type === "trade"
      ? [{ id: i.id, from: i.trade.sender.username, gives: i.trade.offeredCardIds.length + (i.trade.offeredDiamonds > 0 ? 1 : 0) }]
      : [],
  );
  const trades = real.length > 0 || params.get("fake") === "0" ? real : FAKE;
  return { variant: params.get("variant") ?? "A", trades };
}

const tradeTile = "border-[#8b7bff] bg-[#8b7bff]/10";

/** Variants A and B render a block in the page; C renders its pill inside the header (see HeaderBadge). */
export function IncomingTradeBlock({ variant, trades }: { variant: string; trades: ProtoTrade[] }) {
  if (trades.length === 0) return null;
  if (variant === "A") {
    return (
      <Link to="/byte" className={`mx-4 flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-3 ${tradeTile}`}>
        <span className="text-sm font-semibold">
          <span aria-hidden className="mr-1.5">⇄</span>
          Du har {trades.length} byte{trades.length === 1 ? "" : "n"} att svara på
        </span>
        <span className="shrink-0 rounded-lg bg-[#8b7bff] px-3 py-1 text-xs font-semibold text-white">Se byten →</span>
      </Link>
    );
  }
  if (variant === "B") {
    return (
      <section aria-label="Byten att svara på" className="mx-4">
        <h2 className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-tertiary">Byten att svara på</h2>
        <ul className="flex flex-col gap-1.5">
          {trades.map((t) => (
            <li key={t.id}>
              <Link to="/byte" className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${tradeTile}`}>
                <span className="truncate"><span aria-hidden className="mr-1.5">⇄</span><b>{t.from}</b> vill byta ({t.gives} sak{t.gives === 1 ? "" : "er"})</span>
                <span className="shrink-0 text-xs font-semibold text-[#8b7bff]">Granska →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }
  return null;
}

/** Variant C: a pill next to the Diamonds in the Hem header. */
export function HeaderBadge({ variant, trades }: { variant: string; trades: ProtoTrade[] }) {
  if (variant !== "C" || trades.length === 0) return null;
  return (
    <Link to="/byte" className="mr-2 rounded-full bg-[#8b7bff] px-2.5 py-0.5 text-xs font-semibold text-white">
      ⇄ {trades.length} byte{trades.length === 1 ? "" : "n"}
    </Link>
  );
}

/** Floating bottom bar: ← / → or the arrows cycle variants. Hidden in production builds. */
export function PrototypeSwitcher({ variant }: { variant: string }) {
  const [, setParams] = useSearchParams();
  const index = Math.max(0, VARIANTS.findIndex((v) => v.key === variant));
  const go = (delta: number) =>
    setParams((p) => { p.set("variant", VARIANTS[(index + delta + VARIANTS.length) % VARIANTS.length].key); return p; }, { replace: true });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (import.meta.env.PROD) return null;
  return (
    <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-black px-4 py-2 text-sm text-white shadow-lg">
      <button type="button" onClick={() => go(-1)} aria-label="Föregående variant">←</button>
      <span>{VARIANTS[index].key} ({VARIANTS[index].name})</span>
      <button type="button" onClick={() => go(1)} aria-label="Nästa variant">→</button>
    </div>
  );
}
