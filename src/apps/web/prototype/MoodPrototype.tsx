// PROTOTYPE — throwaway, never ship. Wayfinder ticket "What visual identity
// (colours, typography) should the relaunch use?" (#23 on map #7), question 1:
// which MOOD should Peppelinos Bar aim for?
//
// Plan: four moods, switchable via ?stamning=A..D (floating black pill or ← →),
// on the dev-only route /prototyp/stamning, at phone width. Every mood shows the
// same content — wordmark + Diamonds, Event banner, "Väntar på dig", Collection
// progress, one Card per Rarity (Special = holo), a Pack reveal, a few Samling
// rows, the bottom tab bar and a type specimen with å/ä/ö — but owns its own
// layout, type, shapes and surfaces. Not a palette decision: colours here are
// only there to carry each mood. Brand colour is deliberately NOT purple
// (reserved for Epic). Real Card catalog + art, nothing touches the API.

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, Gift, Home, Layers, Repeat, ShoppingBag, Timer, Trophy, User } from "lucide-react";
import { resolveCardDesignUrl } from "../../../data/cardDesignUrls";
import { cards, type CardRarity, type DanceCard } from "../../../data/cards";
import { VariantSwitcher } from "./kit";

// ── Shared content (identical in every mood) ─────────────────────────────────

const R: CardRarity[] = ["common", "rare", "epic", "legendary", "special"];
const LABEL: Record<CardRarity, string> = { common: "Common", rare: "Rare", epic: "Epic", legendary: "Legendary", special: "Special" };
const pick = (r: CardRarity, n = 0) => cards.filter((c) => c.rarity === r && c.designKey)[n] ?? cards.find((c) => c.rarity === r)!;
const ladder = R.map((r) => pick(r));
const pack = [pick("common", 3), pick("common", 4), pick("common", 5), pick("rare", 1), pick("epic", 1)];
const rows = [pick("legendary", 1), pick("epic", 2), pick("rare", 2), pick("common", 6)];
const DIAMONDS = "1 240";
const waiting = [
  { icon: Gift, title: "Dagens diamanter", sub: "+150 · Streak 5/7", cta: "Hämta" },
  { icon: Timer, title: "Guldkista klar", sub: "+2 250 💎", cta: "Öppna" },
  { icon: Repeat, title: "Bytesbud från Saga N", sub: "1 Rare mot 3 Common", cta: "Visa" },
];
const PANGRAM = "Åsa & Örjan dansar bugg på Älvsjömässan";
const TABS = [
  { icon: Home, label: "Hem" }, { icon: ShoppingBag, label: "Butik" }, { icon: Layers, label: "Samling" },
  { icon: Repeat, label: "Byte", badge: 1 }, { icon: Trophy, label: "Topplista" },
];

const art = (c: DanceCard) => resolveCardDesignUrl(c.designKey);

/** Holo + font injection, once. */
function GlobalStyle() {
  useEffect(() => {
    const id = "mood-proto-fonts";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700;800&family=Inter:wght@400;500;600;700&family=Unbounded:wght@500;700;800&family=Manrope:wght@400;500;700&family=Pacifico&family=Fraunces:ital,opsz,wght@0,9..144,600;1,9..144,600&family=DM+Sans:wght@400;500;700&family=Fredoka:wght@500;600;700&family=Nunito:wght@400;600;800&display=swap";
    document.head.appendChild(l);
  }, []);
  return (
    <style>{`
      @keyframes holo { to { --a: 360deg; } }
      @property --a { syntax: '<angle>'; inherits: false; initial-value: 0deg; }
      .holo { background: conic-gradient(from var(--a), #ff6ad5, #ffd36a, #6affb0, #6ad8ff, #b06aff, #ff6ad5); animation: holo 4s linear infinite; }
      .holo-text { background: linear-gradient(90deg,#ff6ad5,#ffd36a,#6affb0,#6ad8ff,#b06aff); -webkit-background-clip: text; background-clip: text; color: transparent; }
      @media (prefers-reduced-motion: reduce) { .holo { animation: none; } }
    `}</style>
  );
}

/** Frame colour per Rarity, tuned per mood. Special always uses the shared holo. */
type Frames = Record<Exclude<CardRarity, "special">, string>;

function CardArt({ card, frames, radius, pad = 3, style, children }: {
  card: DanceCard; frames: Frames; radius: number; pad?: number; style?: CSSProperties; children?: ReactNode;
}) {
  const url = art(card);
  const isSpecial = card.rarity === "special";
  return (
    <div className={`relative aspect-[4/5] w-full ${isSpecial ? "holo" : ""}`}
      style={{ padding: pad, borderRadius: radius, background: isSpecial ? undefined : frames[card.rarity as keyof Frames], ...style }}>
      <div className="relative h-full w-full overflow-hidden bg-neutral-800" style={{ borderRadius: Math.max(0, radius - pad) }}>
        {url ? <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover object-top" />
          : <div className="grid h-full place-items-center text-2xl text-white/30">?</div>}
      </div>
      {children}
    </div>
  );
}

function Shell({ bg, children, font }: { bg: string; children: ReactNode; font: string }) {
  return (
    <div className="min-h-screen" style={{ background: "#d4d4d8" }}>
      <div className="relative mx-auto min-h-screen w-full max-w-[390px] pb-40 shadow-xl" style={{ background: bg, fontFamily: font }}>{children}</div>
    </div>
  );
}

function TabBar({ bg, fg, active, accent, border, badgeBg, badgeFg, radius = 0, font }: {
  bg: string; fg: string; active: string; accent?: string; border?: string; badgeBg: string; badgeFg: string; radius?: number; font?: string;
}) {
  return (
    <nav className="fixed bottom-0 left-1/2 z-50 flex w-full max-w-[390px] -translate-x-1/2" style={{ background: bg, borderTop: border, fontFamily: font, borderRadius: `${radius}px ${radius}px 0 0` }}>
      {TABS.map((t, i) => (
        <div key={t.label} className="relative flex h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]" style={{ color: i === 0 ? active : fg }}>
          {i === 0 && accent && <span className="absolute top-0 h-[3px] w-8" style={{ background: accent }} />}
          <t.icon className="h-5 w-5" strokeWidth={i === 0 ? 2.5 : 2} />
          {t.label}
          {t.badge && <span className="absolute right-[22%] top-2 grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold" style={{ background: badgeBg, color: badgeFg }}>{t.badge}</span>}
        </div>
      ))}
    </nav>
  );
}

function Specimen({ display, body, fg, muted, displayStyle }: { display: string; body: string; fg: string; muted: string; displayStyle?: CSSProperties }) {
  return (
    <section className="px-4 pt-6">
      <p className="text-[11px] uppercase tracking-widest" style={{ color: muted }}>Typsnitt · {display} + {body}</p>
      <p className="mt-1 text-2xl leading-tight" style={{ color: fg, fontFamily: display, ...displayStyle }}>{PANGRAM}</p>
      <p className="mt-1 text-base" style={{ color: fg, fontFamily: body }}>{PANGRAM}. Brödtext 16px, rad för rad i långa listor.</p>
    </section>
  );
}

// ── A · Tävlingsprogram ──────────────────────────────────────────────────────
// Sports trading card / competition programme: off-white paper, black ink, one
// signal colour, condensed uppercase display, hard rules, square corners,
// scoreboard numerals. Celebration only on the higher Rarities.

function MoodA() {
  const ink = "#121212", paper = "#F5F2EA", signal = "#E8432B", muted = "#6b6760", rule = "#121212";
  const D = "'Barlow Condensed', sans-serif", B = "Inter, sans-serif";
  const frames: Frames = { common: "#9a958c", rare: "#1f6fe0", epic: "#8a3ffc", legendary: "linear-gradient(135deg,#f7c948,#c8901a)" };
  const H = ({ children, n }: { children: ReactNode; n?: string }) => (
    <div className="flex items-baseline justify-between border-b-2 pb-1" style={{ borderColor: rule }}>
      <h2 className="text-xl font-extrabold uppercase tracking-wide" style={{ fontFamily: D, color: ink }}>{children}</h2>
      {n && <span className="text-sm font-bold" style={{ fontFamily: D, color: muted }}>{n}</span>}
    </div>
  );
  return (
    <Shell bg={paper} font={B}>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b-4 px-4" style={{ background: paper, borderColor: ink }}>
        <span className="text-[26px] font-extrabold uppercase leading-none tracking-tight" style={{ fontFamily: D, color: ink }}>Peppelinos<span style={{ color: signal }}> Bar</span></span>
        <div className="flex items-center gap-3" style={{ color: ink }}>
          <span className="text-xl font-bold tabular-nums" style={{ fontFamily: D }}>💎 {DIAMONDS}</span>
          <Bell className="h-5 w-5" /><User className="h-5 w-5" />
        </div>
      </header>
      <section className="flex items-stretch" style={{ background: ink, color: paper }}>
        <div className="flex w-20 flex-col items-center justify-center" style={{ background: signal }}>
          <span className="text-xs font-bold uppercase" style={{ fontFamily: D }}>Lör</span>
          <span className="text-4xl font-extrabold leading-none" style={{ fontFamily: D }}>14</span>
        </div>
        <div className="flex-1 p-3">
          <p className="text-xs uppercase tracking-widest opacity-70">Event</p>
          <p className="text-2xl font-extrabold uppercase leading-tight" style={{ fontFamily: D }}>Kumla GP · Dubbla dagens</p>
        </div>
      </section>
      <section className="px-4 pt-5">
        <H n="3">Väntar på dig</H>
        {waiting.map((w) => (
          <div key={w.title} className="flex h-14 items-center gap-3 border-b" style={{ borderColor: "#d6d1c4" }}>
            <w.icon className="h-5 w-5" style={{ color: ink }} />
            <div className="flex-1 leading-tight"><p className="font-semibold" style={{ color: ink }}>{w.title}</p><p className="text-sm" style={{ color: muted }}>{w.sub}</p></div>
            <button className="h-11 px-4 text-lg font-bold uppercase" style={{ fontFamily: D, background: ink, color: paper }}>{w.cta}</button>
          </div>
        ))}
      </section>
      <section className="px-4 pt-5">
        <H>SM 2026</H>
        <div className="mt-2 grid grid-cols-5 border-2" style={{ borderColor: ink }}>
          {[["87", "140", "Totalt"], ["61", "80", "Com"], ["18", "36", "Rare"], ["7", "18", "Epic"], ["1", "6", "Leg"]].map(([a, b, l], i) => (
            <div key={l} className={`p-2 text-center ${i ? "border-l-2" : ""}`} style={{ borderColor: ink, background: i ? undefined : ink, color: i ? ink : paper }}>
              <p className="text-2xl font-extrabold leading-none tabular-nums" style={{ fontFamily: D }}>{a}<span className="text-sm opacity-60">/{b}</span></p>
              <p className="text-[10px] font-semibold uppercase tracking-wider">{l}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="px-4 pt-5">
        <H>Raritet</H>
        <div className="mt-3 grid grid-cols-5 gap-1.5">
          {ladder.map((c) => (
            <div key={c.id}>
              <CardArt card={c} frames={frames} radius={2} pad={3} />
              <p className="mt-1 text-center text-[11px] font-bold uppercase" style={{ fontFamily: D, color: ink }}>{c.rarity === "special" ? <span className="holo-text">Special</span> : LABEL[c.rarity]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="px-4 pt-5">
        <H n="5 kort">Nytt Pack · SM 2026</H>
        <div className="mt-3 flex gap-1.5">
          {pack.map((c, i) => (
            <div key={i} className="flex-1"><CardArt card={c} frames={frames} radius={2} pad={c.rarity === "common" ? 2 : 4} />
              {c.rarity !== "common" && <p className="mt-1 text-center text-xs font-extrabold uppercase" style={{ fontFamily: D, color: signal }}>Ny! {LABEL[c.rarity]}</p>}
            </div>
          ))}
        </div>
        <button className="mt-3 h-12 w-full text-xl font-extrabold uppercase tracking-wide" style={{ fontFamily: D, background: signal, color: "#fff" }}>Öppna Pack · 💎 100</button>
      </section>
      <section className="px-4 pt-5">
        <H n="87 / 140">Samling</H>
        {rows.map((c, i) => (
          <div key={c.id} className="flex h-14 items-center gap-3 border-b" style={{ borderColor: "#d6d1c4" }}>
            <span className="w-6 text-right text-lg font-bold tabular-nums" style={{ fontFamily: D, color: muted }}>{String(i + 1).padStart(2, "0")}</span>
            <div className="w-9"><CardArt card={c} frames={frames} radius={1} pad={2} /></div>
            <div className="flex-1 leading-tight"><p className="font-semibold" style={{ color: ink }}>{c.name}</p><p className="text-sm" style={{ color: muted }}>{c.club ?? "—"}</p></div>
            <span className="text-sm font-bold uppercase" style={{ fontFamily: D, color: ink }}>{LABEL[c.rarity]}</span>
          </div>
        ))}
      </section>
      <Specimen display={D} body={B} fg={ink} muted={muted} displayStyle={{ fontWeight: 800, textTransform: "uppercase" }} />
      <TabBar bg={paper} fg={muted} active={ink} accent={signal} border={`2px solid ${ink}`} badgeBg={signal} badgeFg="#fff" font={D} />
    </Shell>
  );
}

// ── B · Dansgolv ─────────────────────────────────────────────────────────────
// The dance floor at night: near-black, one electric accent, wide geometric
// display type, big Card art, Rarity glows like stage lights.

function MoodB() {
  const bg = "#0A0A12", surf = "#15151F", fg = "#F2F2F7", muted = "#9A9AB0", acc = "#C6FF3D";
  const D = "Unbounded, sans-serif", B = "Manrope, sans-serif";
  const frames: Frames = { common: "#5b5b6e", rare: "#2f8cff", epic: "#a259ff", legendary: "linear-gradient(135deg,#ffe27a,#ffb020)" };
  const glow: Record<CardRarity, string> = { common: "none", rare: "0 0 18px #2f8cff88", epic: "0 0 22px #a259ffaa", legendary: "0 0 26px #ffc04dbb", special: "0 0 30px #ff6ad5aa" };
  const H = ({ children }: { children: ReactNode }) => <h2 className="mb-3 text-sm font-bold uppercase tracking-[0.2em]" style={{ fontFamily: D, color: muted }}>{children}</h2>;
  return (
    <Shell bg={bg} font={B}>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between px-4 backdrop-blur" style={{ background: `${bg}cc` }}>
        <span className="text-lg font-extrabold" style={{ fontFamily: D, color: fg }}>PEPPELINOS<span style={{ color: acc }}>●</span></span>
        <div className="flex items-center gap-3" style={{ color: fg }}>
          <span className="rounded-full px-3 py-1 text-sm font-bold" style={{ background: surf, color: "#7ee8ff" }}>💎 {DIAMONDS}</span>
          <Bell className="h-5 w-5" /><User className="h-5 w-5" />
        </div>
      </header>
      <section className="relative mx-4 mt-2 overflow-hidden rounded-3xl p-5" style={{ background: "radial-gradient(120% 100% at 0% 0%, #2a1f6b 0%, #0A0A12 60%), #0A0A12" }}>
        <div className="absolute -right-6 -top-4 w-32 rotate-12 opacity-90"><CardArt card={pick("legendary", 2)} frames={frames} radius={14} style={{ boxShadow: glow.legendary }} /></div>
        <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: acc }}>Event · Lördag</p>
        <p className="mt-1 max-w-[60%] text-2xl font-extrabold leading-tight" style={{ fontFamily: D, color: fg }}>Kumla GP</p>
        <p className="mt-1 max-w-[60%] text-sm" style={{ color: muted }}>Dubbla dagens diamanter hela helgen</p>
      </section>
      <section className="pt-6">
        <div className="px-4"><H>Väntar på dig</H></div>
        <div className="flex gap-3 overflow-x-auto px-4 pb-1">
          {waiting.map((w, i) => (
            <div key={w.title} className="w-44 shrink-0 rounded-2xl p-4" style={{ background: surf, border: i === 0 ? `1px solid ${acc}` : "1px solid #ffffff14" }}>
              <w.icon className="h-6 w-6" style={{ color: i === 0 ? acc : fg }} />
              <p className="mt-3 font-bold leading-tight" style={{ color: fg }}>{w.title}</p>
              <p className="text-sm" style={{ color: muted }}>{w.sub}</p>
              <button className="mt-3 h-11 w-full rounded-full text-sm font-extrabold" style={i === 0 ? { background: acc, color: bg } : { background: "#ffffff14", color: fg }}>{w.cta}</button>
            </div>
          ))}
        </div>
      </section>
      <section className="px-4 pt-6">
        <H>SM 2026</H>
        <div className="flex items-center gap-4 rounded-2xl p-4" style={{ background: surf }}>
          <div className="grid h-20 w-20 place-items-center rounded-full" style={{ background: `conic-gradient(${acc} ${(87 / 140) * 360}deg, #ffffff14 0)` }}>
            <div className="grid h-16 w-16 place-items-center rounded-full text-lg font-extrabold" style={{ background: surf, color: fg, fontFamily: D }}>62%</div>
          </div>
          <div className="flex-1 space-y-1.5">
            {(["rare", "epic", "legendary"] as const).map((r, i) => (
              <div key={r} className="flex items-center gap-2 text-sm" style={{ color: muted }}>
                <span className="w-20">{LABEL[r]}</span>
                <div className="h-1.5 flex-1 rounded-full" style={{ background: "#ffffff14" }}><div className="h-full rounded-full" style={{ width: `${[50, 39, 17][i]}%`, background: frames[r] }} /></div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="px-4 pt-6">
        <H>Raritet</H>
        <div className="grid grid-cols-5 gap-2">
          {ladder.map((c) => (
            <div key={c.id}>
              <CardArt card={c} frames={frames} radius={10} pad={2} style={{ boxShadow: glow[c.rarity] }} />
              <p className="mt-2 text-center text-[10px] font-bold uppercase tracking-wider" style={{ color: fg }}>{c.rarity === "special" ? <span className="holo-text">Special</span> : LABEL[c.rarity]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="px-4 pt-6">
        <H>Nytt Pack</H>
        <div className="relative flex h-44 items-end justify-center">
          {pack.map((c, i) => (
            <div key={i} className="absolute bottom-0 w-24" style={{ transform: `translateX(${(i - 2) * 52}px) rotate(${(i - 2) * 8}deg) translateY(${Math.abs(i - 2) * 8}px)`, zIndex: c.rarity === "common" ? 1 : 5 }}>
              <CardArt card={c} frames={frames} radius={10} pad={2} style={{ boxShadow: glow[c.rarity] }} />
            </div>
          ))}
        </div>
        <button className="mt-4 h-14 w-full rounded-full text-base font-extrabold" style={{ fontFamily: D, background: acc, color: bg }}>Öppna Pack · 💎 100</button>
      </section>
      <section className="px-4 pt-6">
        <H>Samling</H>
        <div className="space-y-2">
          {rows.map((c) => (
            <div key={c.id} className="flex h-16 items-center gap-3 rounded-2xl px-3" style={{ background: surf }}>
              <div className="w-10"><CardArt card={c} frames={frames} radius={6} pad={2} /></div>
              <div className="flex-1 leading-tight"><p className="font-bold" style={{ color: fg }}>{c.name}</p><p className="text-sm" style={{ color: muted }}>{c.club ?? "—"}</p></div>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: "#ffffff14", color: fg }}>{LABEL[c.rarity]}</span>
            </div>
          ))}
        </div>
      </section>
      <Specimen display={D} body={B} fg={fg} muted={muted} displayStyle={{ fontWeight: 700 }} />
      <TabBar bg={`${surf}f2`} fg={muted} active={acc} border="1px solid #ffffff14" badgeBg={acc} badgeFg={bg} radius={20} />
    </Shell>
  );
}

// ── C · Baren ────────────────────────────────────────────────────────────────
// Leans into the name: a warm, dark bar at closing time. Espresso and cream,
// a neon-sign wordmark, serif display, the daily loop as a chalkboard menu.

function MoodC() {
  const bg = "#1F1513", surf = "#2C1F1B", cream = "#F4E8D6", muted = "#BFA992", neon = "#FF7A59";
  const D = "Fraunces, serif", B = "'DM Sans', sans-serif", SIGN = "Pacifico, cursive";
  const frames: Frames = { common: "#8c7b6b", rare: "#4b8fe8", epic: "#a46bf0", legendary: "linear-gradient(135deg,#f3d27a,#b98a2e)" };
  const H = ({ children, right }: { children: ReactNode; right?: string }) => (
    <div className="mb-3 flex items-baseline justify-between">
      <h2 className="text-2xl italic" style={{ fontFamily: D, color: cream }}>{children}</h2>
      {right && <span className="text-sm" style={{ color: muted }}>{right}</span>}
    </div>
  );
  return (
    <Shell bg={bg} font={B}>
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between px-4" style={{ background: bg }}>
        <span className="text-[26px] leading-none" style={{ fontFamily: SIGN, color: neon, textShadow: `0 0 6px ${neon}, 0 0 18px ${neon}88` }}>Peppelinos Bar</span>
        <div className="flex items-center gap-3" style={{ color: cream }}>
          <span className="text-sm font-bold">💎 {DIAMONDS}</span>
          <Bell className="h-5 w-5" />
        </div>
      </header>
      <section className="mx-4 rounded-2xl border p-4" style={{ borderColor: `${neon}66`, background: surf }}>
        <p className="text-xs uppercase tracking-[0.25em]" style={{ color: neon }}>Ikväll · Event</p>
        <p className="mt-1 text-3xl" style={{ fontFamily: D, color: cream }}>Kumla GP</p>
        <p className="text-sm" style={{ color: muted }}>Dubbla dagens diamanter, lördag till söndag</p>
      </section>
      <section className="mx-4 mt-6 rounded-2xl p-4" style={{ background: "#16100E", border: "1px dashed #ffffff22" }}>
        <H right="3 saker">Dagens meny</H>
        {waiting.map((w) => (
          <div key={w.title} className="flex min-h-14 items-center gap-3 py-1">
            <div className="flex-1">
              <div className="flex items-baseline gap-2"><span className="font-bold" style={{ color: cream }}>{w.title}</span><span className="flex-1 border-b border-dotted" style={{ borderColor: "#ffffff33" }} /></div>
              <p className="text-sm" style={{ color: muted }}>{w.sub}</p>
            </div>
            <button className="h-11 rounded-full px-4 text-sm font-bold" style={{ background: neon, color: bg }}>{w.cta}</button>
          </div>
        ))}
      </section>
      <section className="px-4 pt-6">
        <H>SM 2026</H>
        {/* Scoreboard from mood A (map owner's pick), restyled for C: per-Rarity
            cells with a thin Rarity-coloured top edge; label always present. */}
        <div className="grid grid-cols-[1.25fr_repeat(4,1fr)] gap-1.5">
          {([["87", "140", "Totalt", null], ["61", "80", "Common", "common"], ["18", "36", "Rare", "rare"], ["7", "18", "Epic", "epic"], ["1", "6", "Legend.", "legendary"]] as const).map(([a, b, l, r]) => {
            const total = r === null;
            return (
              <div key={l} className="relative overflow-hidden rounded-xl px-1 pb-2 pt-3 text-center"
                style={total ? { background: neon, color: bg } : { background: surf, color: cream }}>
                {!total && <span className="absolute inset-x-0 top-0 h-[3px]" style={{ background: frames[r] }} />}
                <p className="text-[26px] leading-none tabular-nums" style={{ fontFamily: D }}>{a}<span className="text-sm" style={{ opacity: 0.6 }}>/{b}</span></p>
                <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: total ? bg : muted }}>{l}</p>
              </div>
            );
          })}
        </div>
      </section>
      <section className="px-4 pt-6">
        <H>Raritet</H>
        <div className="grid grid-cols-5 gap-2">
          {ladder.map((c) => (
            <div key={c.id}>
              <CardArt card={c} frames={frames} radius={12} pad={3} />
              <p className="mt-1.5 text-center text-xs italic" style={{ fontFamily: D, color: cream }}>{c.rarity === "special" ? <span className="holo-text not-italic font-bold">Special</span> : LABEL[c.rarity]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="px-4 pt-6">
        <H right="5 kort">Nytt Pack</H>
        <div className="grid grid-cols-5 gap-2">
          {pack.map((c, i) => (
            <div key={i} style={{ transform: c.rarity === "common" ? undefined : "translateY(-8px)" }}>
              <CardArt card={c} frames={frames} radius={12} pad={3} style={c.rarity === "common" ? { opacity: 0.75 } : { boxShadow: `0 8px 24px ${neon}55` }} />
            </div>
          ))}
        </div>
        <button className="mt-4 h-12 w-full rounded-full text-base font-bold" style={{ background: neon, color: bg }}>Öppna Pack · 💎 100</button>
      </section>
      <section className="px-4 pt-6">
        <H>Samling</H>
        <div className="overflow-hidden rounded-2xl" style={{ background: surf }}>
          {rows.map((c, i) => (
            <div key={c.id} className={`flex h-16 items-center gap-3 px-3 ${i ? "border-t" : ""}`} style={{ borderColor: "#ffffff12" }}>
              <div className="w-10"><CardArt card={c} frames={frames} radius={6} pad={2} /></div>
              <div className="flex-1 leading-tight"><p className="font-semibold" style={{ color: cream }}>{c.name}</p><p className="text-sm" style={{ color: muted }}>{c.club ?? "—"}</p></div>
              <span className="text-sm italic" style={{ fontFamily: D, color: muted }}>{LABEL[c.rarity]}</span>
            </div>
          ))}
        </div>
      </section>
      <Specimen display={D} body={B} fg={cream} muted={muted} displayStyle={{ fontStyle: "italic" }} />
      <TabBar bg={surf} fg={muted} active={neon} border="1px solid #ffffff12" badgeBg={neon} badgeFg={bg} />
    </Shell>
  );
}

// ── D · Samlarpärm ───────────────────────────────────────────────────────────
// Playful collectible album: warm light paper, chunky rounded type, sticker
// Cards with white borders and drop shadows, pastel panels. Closest in spirit
// to today's Shantell Sans, but readable.

function MoodD() {
  const bg = "#FFF6E9", ink = "#2B2340", muted = "#7A6F8C", brand = "#14B8A6", sun = "#FFD166", pink = "#FF8FAB";
  const D = "Fredoka, sans-serif", B = "Nunito, sans-serif";
  const frames: Frames = { common: "#c9c3d6", rare: "#4d9bff", epic: "#b07cff", legendary: "linear-gradient(135deg,#ffe066,#ffb300)" };
  const sticker: CSSProperties = { boxShadow: "0 0 0 3px #fff, 0 4px 0 3px #00000018" };
  const H = ({ children, right }: { children: ReactNode; right?: string }) => (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-xl font-bold" style={{ fontFamily: D, color: ink }}>{children}</h2>
      {right && <span className="rounded-full px-2.5 py-0.5 text-sm font-bold" style={{ background: "#fff", color: ink }}>{right}</span>}
    </div>
  );
  return (
    <Shell bg={bg} font={B}>
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between px-4" style={{ background: bg }}>
        <span className="text-2xl font-bold" style={{ fontFamily: D, color: ink }}>Peppelinos <span className="rounded-lg px-1.5" style={{ background: brand, color: "#fff" }}>Bar</span></span>
        <div className="flex items-center gap-2">
          <span className="rounded-full px-3 py-1 text-sm font-extrabold" style={{ background: "#fff", color: ink, boxShadow: "0 2px 0 #00000014" }}>💎 {DIAMONDS}</span>
          <span className="grid h-9 w-9 place-items-center rounded-full bg-white" style={{ color: ink }}><Bell className="h-5 w-5" /></span>
        </div>
      </header>
      <section className="mx-4 mt-1 flex items-center gap-3 rounded-3xl p-4" style={{ background: sun }}>
        <span className="text-4xl">🏆</span>
        <div className="flex-1"><p className="text-xl font-bold leading-tight" style={{ fontFamily: D, color: ink }}>Kumla GP på lördag!</p><p className="text-sm" style={{ color: ink }}>Dubbla dagens diamanter hela helgen</p></div>
      </section>
      <section className="px-4 pt-6">
        <H right="3">Väntar på dig</H>
        <div className="grid grid-cols-3 gap-2.5">
          {waiting.map((w, i) => (
            <div key={w.title} className="flex flex-col items-center rounded-3xl bg-white p-3 text-center" style={{ boxShadow: "0 3px 0 #00000012" }}>
              <span className="grid h-11 w-11 place-items-center rounded-2xl" style={{ background: [sun, "#CFF5EF", "#FFE0E8"][i] }}><w.icon className="h-6 w-6" style={{ color: ink }} /></span>
              <p className="mt-2 text-sm font-extrabold leading-tight" style={{ color: ink }}>{w.title}</p>
              <p className="text-xs" style={{ color: muted }}>{w.sub}</p>
              <button className="mt-2 h-11 w-full rounded-2xl text-sm font-bold" style={{ fontFamily: D, background: brand, color: "#fff", boxShadow: "0 3px 0 #0e8a7d" }}>{w.cta}</button>
            </div>
          ))}
        </div>
      </section>
      <section className="px-4 pt-6">
        <H right="87 / 140">Pärm: SM 2026</H>
        <div className="grid grid-cols-10 gap-1 rounded-3xl bg-white p-3">
          {Array.from({ length: 40 }, (_, i) => (
            <div key={i} className="aspect-[4/5] rounded-md" style={{ background: i < 25 ? (i % 9 === 0 ? frames.rare : i % 13 === 0 ? frames.epic : "#e7e2f0") : "transparent", border: i < 25 ? undefined : "2px dashed #e1dbea" }} />
          ))}
        </div>
      </section>
      <section className="px-4 pt-6">
        <H>Raritet</H>
        <div className="grid grid-cols-5 gap-3">
          {ladder.map((c, i) => (
            <div key={c.id} style={{ transform: `rotate(${[-4, 3, -2, 4, -3][i]}deg)` }}>
              <CardArt card={c} frames={frames} radius={12} pad={3} style={sticker} />
              <p className="mt-2 text-center text-xs font-extrabold" style={{ color: ink }}>{c.rarity === "special" ? <span className="holo-text">Special</span> : LABEL[c.rarity]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="px-4 pt-6">
        <H right="5 kort">Nytt Pack</H>
        <div className="grid grid-cols-5 gap-3">
          {pack.map((c, i) => (
            <div key={i} className="relative" style={{ transform: `rotate(${[-5, 2, -2, 5, -4][i]}deg)` }}>
              <CardArt card={c} frames={frames} radius={12} pad={3} style={sticker} />
              {c.rarity !== "common" && <span className="absolute -right-1 -top-2 rounded-full px-1.5 text-[10px] font-extrabold" style={{ background: pink, color: "#fff" }}>Ny!</span>}
            </div>
          ))}
        </div>
        <button className="mt-5 h-14 w-full rounded-3xl text-xl font-bold" style={{ fontFamily: D, background: brand, color: "#fff", boxShadow: "0 5px 0 #0e8a7d" }}>Öppna Pack · 💎 100</button>
      </section>
      <section className="px-4 pt-6">
        <H>Samling</H>
        <div className="space-y-2.5">
          {rows.map((c) => (
            <div key={c.id} className="flex h-16 items-center gap-3 rounded-3xl bg-white px-3" style={{ boxShadow: "0 3px 0 #00000010" }}>
              <div className="w-10"><CardArt card={c} frames={frames} radius={8} pad={2} /></div>
              <div className="flex-1 leading-tight"><p className="font-extrabold" style={{ color: ink }}>{c.name}</p><p className="text-sm" style={{ color: muted }}>{c.club ?? "—"}</p></div>
              <span className="rounded-full px-2 py-0.5 text-xs font-extrabold text-white" style={{ background: c.rarity === "legendary" ? "#e0a100" : frames[c.rarity as keyof Frames] }}>{LABEL[c.rarity]}</span>
            </div>
          ))}
        </div>
      </section>
      <Specimen display={D} body={B} fg={ink} muted={muted} displayStyle={{ fontWeight: 700 }} />
      <TabBar bg="#fff" fg={muted} active={brand} badgeBg={pink} badgeFg="#fff" radius={24} font={D} />
    </Shell>
  );
}

// ── Switcher ─────────────────────────────────────────────────────────────────

const MOODS: Record<string, { name: string; C: () => JSX.Element }> = {
  A: { name: "Tävlingsprogram", C: MoodA },
  B: { name: "Dansgolv", C: MoodB },
  C: { name: "Baren", C: MoodC },
  D: { name: "Samlarpärm", C: MoodD },
};

export function MoodPrototype() {
  const [params, setParams] = useSearchParams();
  const keys = Object.keys(MOODS);
  const current = (params.get("stamning") ?? "A").toUpperCase();
  const Mood = (MOODS[current] ?? MOODS.A).C;
  return (
    <>
      <GlobalStyle />
      <Mood key={current} />
      <VariantSwitcher keys={keys} names={Object.fromEntries(keys.map((k) => [k, MOODS[k].name]))} current={MOODS[current] ? current : "A"}
        onChange={(k) => { setParams((p) => { p.set("stamning", k); return p; }, { replace: true }); window.scrollTo(0, 0); }} bottom="bottom-[76px]" />
    </>
  );
}
