// PROTOTYPE — throwaway, never ship. Wayfinder ticket "How does the new visual
// identity look on the chosen screens?" (#20 on map #7).
//
// Plan: three variations WITHIN the decided "Baren" identity (dark only,
// espresso + cream, Pacifico / Fraunces / DM Sans, icy cyan Diamonds, holo
// Special), laid over the chosen key screens on /prototyp/skarmar. Switch with
// ?tema=A|B|C (the second, smaller pill, or the [ and ] keys):
//   A · Neon       — the brief as written: neon coral accent, filled surfaces,
//                    thin flat Card frame with a Rarity pip.
//   B · Bärnsten   — warm amber accent, low surface contrast (hairlines, not
//                    fills), Card in a dark mat with the Rarity as a caption.
//   C · Kontrast   — coral on a deeper room, lighter raised surfaces, larger
//                    radii, heavy metallic Card frame.
// ?skarm=stil opens a style sheet (frames, badges, scoreboard, trophies, empty
// states, art fallback, Diamonds icon, contrast) for the current tema.

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight } from "lucide-react";
import "./baren.css";
import diamondCyan from "./diamond-cyan.png";
import { resolveCardDesignUrl } from "../../../data/cardDesignUrls";
import { cardsIn, collections, otherPlayers, rarityLabel, type CardRarity, type DanceCard } from "./data";

/** The picks from tickets #18 (phone) and #19 (desktop) are the defaults now. */
export const PICKS: Record<string, string> = { hem: "B", butik: "A", samling: "B", byte: "A", dhem: "C", dbutik: "B", dsamling: "B", dbyte: "C" };

export const TEMAS = { A: "Neon", B: "Bärnsten", C: "Kontrast" } as const;
type Tema = keyof typeof TEMAS;

export function useTema(): [Tema, (t: Tema) => void] {
  const [params, setParams] = useSearchParams();
  const raw = (params.get("tema") ?? "A").toUpperCase();
  const tema = (raw in TEMAS ? raw : "A") as Tema;
  return [tema, (t) => setParams((p) => { p.set("tema", t); return p; }, { replace: true })];
}

/** Root wrapper: tokens, fonts, theme switcher. */
export function BarenRoot({ children, className = "", switcherBottom = "bottom-[118px]" }: { children: ReactNode; className?: string; switcherBottom?: string }) {
  const [tema] = useTema();
  useEffect(() => {
    const id = "baren-fonts";
    if (document.getElementById(id)) return;
    const l = document.createElement("link");
    l.id = id; l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?family=Pacifico&family=Fraunces:ital,opsz,wght@0,9..144,500;0,9..144,600;1,9..144,500;1,9..144,600&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&display=swap";
    document.head.appendChild(l);
  }, []);
  return (
    <div className={`baren ${className}`} data-tema={tema}>
      {children}
      <TemaSwitcher bottom={switcherBottom} />
    </div>
  );
}

function TemaSwitcher({ bottom }: { bottom: string }) {
  const [tema, setTema] = useTema();
  const [params, setParams] = useSearchParams();
  const keys = Object.keys(TEMAS) as Tema[];
  const step = (d: number) => setTema(keys[(keys.indexOf(tema) + d + keys.length) % keys.length]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea, [contenteditable]")) return;
      if (e.key === "[") step(-1);
      if (e.key === "]") step(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const onStil = params.get("skarm") === "stil";
  return (
    <div className={`fixed ${bottom} left-1/2 z-[70] flex -translate-x-1/2 items-center gap-1 rounded-full border-2 border-cyan-300 bg-black px-1 py-0.5 font-mono text-[11px] text-cyan-200 shadow-xl`}>
      <button onClick={() => step(-1)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10" aria-label="Föregående tema"><ChevronLeft className="h-3.5 w-3.5" /></button>
      <span className="whitespace-nowrap px-1">tema {tema} · {TEMAS[tema]}</span>
      <button onClick={() => step(1)} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/10" aria-label="Nästa tema"><ChevronRight className="h-3.5 w-3.5" /></button>
      <button onClick={() => setParams((p) => { p.set("skarm", onStil ? "hem" : "stil"); return p; }, { replace: true })}
        className="ml-1 rounded-full px-2 py-1 text-cyan-200/80 hover:bg-white/10">{onStil ? "← skärmar" : "stilark"}</button>
    </div>
  );
}

// ── Brand bits ───────────────────────────────────────────────────────────────

export function Wordmark({ size = 24 }: { size?: number }) {
  return (
    <span className="font-sign whitespace-nowrap leading-none" style={{ fontSize: size, color: "var(--accent)", textShadow: "0 0 6px var(--accent), 0 0 18px color-mix(in srgb, var(--accent) 55%, transparent)" }}>
      Peppelinos Bar
    </span>
  );
}

/** The old logo.jpeg, recoloured icy cyan; now only the Diamonds icon. */
export function DiamondIcon({ size = 18 }: { size?: number }) {
  return <img src={diamondCyan} alt="" aria-hidden width={size} height={Math.round(size * 0.77)} style={{ display: "inline-block", verticalAlign: "-0.12em" }} />;
}

export function Diamonds({ n, className = "" }: { n: number; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${className}`} style={{ color: "var(--gem)" }}>
      <DiamondIcon /> {n.toLocaleString("sv-SE")}
    </span>
  );
}

// ── Card frame ───────────────────────────────────────────────────────────────

const PIP: Record<CardRarity, string> = { common: "●", rare: "◆", epic: "▲", legendary: "★", special: "✦" };

function initials(name: string) {
  return name.split(/[\s&/-]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
}

/** The one Card frame. Owned → Rarity frame (holo for Special) + art or the
 * art fallback; missing → silhouette. `small` drops pip/caption for tiny thumbs. */
export function CardFrame({ card, owned = true, small, selected, noArt, children }: {
  card: DanceCard; owned?: boolean; small?: boolean; selected?: boolean; noArt?: boolean; children?: ReactNode;
}) {
  const url = owned && !noArt ? resolveCardDesignUrl(card.designKey) : undefined;
  const cls = ["pcard", small && "is-small", !owned && "is-missing", owned && card.rarity === "special" && "holo", selected && "is-selected"].filter(Boolean).join(" ");
  return (
    <span className={cls} data-r={card.rarity}>
      <span className="pcard-art">
        {!owned ? <span className="grid h-full place-items-center text-lg" style={{ color: "var(--text3)" }}>?</span>
          : <span className="pcard-fallback"><span>{initials(card.name)}</span></span>}
        {url && <img src={url} alt="" onError={(e) => { e.currentTarget.style.display = "none"; }} />}
      </span>
      {owned && <span className="pcard-pip" aria-label={rarityLabel[card.rarity]}>{PIP[card.rarity]}</span>}
      {owned && <span className="pcard-caption">{rarityLabel[card.rarity]}</span>}
      {children}
    </span>
  );
}

// ── Badges ───────────────────────────────────────────────────────────────────

export function BadgeNy() {
  return <span className="rounded-md px-1.5 py-px text-[11px] font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>Ny!</span>;
}
export function BadgeHar({ have }: { have?: number }) {
  return <span className="rounded-md px-1.5 py-px text-[11px] font-medium" style={{ background: "rgba(18,12,10,.85)", color: "var(--text)", boxShadow: "inset 0 0 0 1px var(--line-strong)" }}>Har redan{have ? ` ×${have}` : ""}</span>;
}

// ── Scoreboard (per-Rarity, Special left out) ────────────────────────────────

type Prog = { have: number; total: number; rarity: Record<CardRarity, { have: number; total: number }> };

export function Scoreboard({ p, compact }: { p: Prog; compact?: boolean }) {
  const cells: [string, number, number, CardRarity | null][] = [
    ["Totalt", p.have, p.total, null],
    ["Common", p.rarity.common.have, p.rarity.common.total, "common"],
    ["Rare", p.rarity.rare.have, p.rarity.rare.total, "rare"],
    ["Epic", p.rarity.epic.have, p.rarity.epic.total, "epic"],
    ["Legend.", p.rarity.legendary.have, p.rarity.legendary.total, "legendary"],
  ];
  return (
    <div className="grid grid-cols-[1.25fr_repeat(4,1fr)] gap-1.5">
      {cells.map(([label, have, total, r]) => (
        <div key={label} className="relative overflow-hidden rounded-xl px-1 pb-2 pt-3 text-center"
          style={r === null ? { background: "var(--text)", color: "var(--bg)" } : { background: "var(--surf2)", color: "var(--text)" }}>
          {r && <span className={`absolute inset-x-0 top-0 h-[3px] rb-${r}`} />}
          <p className={`font-display leading-none tabular-nums ${compact ? "text-[22px]" : "text-[26px]"}`}>{have}</p>
          <p className="mt-0.5 text-[11px] tabular-nums opacity-70">av {total}</p>
          <p className="mt-1 text-[11px] font-bold uppercase tracking-wider" style={{ color: r === null ? "var(--bg)" : "var(--text2)" }}>{label}</p>
        </div>
      ))}
    </div>
  );
}

// ── Special trophies ─────────────────────────────────────────────────────────

/** Fake owner per Special: you if you own it, else a deterministic other player or nobody. */
export function specialOwner(card: DanceCard, mine: Record<string, number>) {
  if (mine[card.id]) return "Du";
  const holder = otherPlayers.find((p) => p.owned[card.id]);
  if (holder) return holder.name;
  const h = [...card.id].reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return h % 3 === 0 ? null : otherPlayers[h % otherPlayers.length].name;
}

export function TrophyShelf({ collectionId, owned, cols = "grid-cols-3" }: { collectionId: string; owned: Record<string, number>; cols?: string }) {
  const specials = cardsIn(collectionId).filter((c) => c.rarity === "special");
  if (!specials.length) return null;
  return (
    <section className="rounded-2xl border p-3" style={{ background: "linear-gradient(180deg, var(--surf2), var(--surf))" }}>
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="font-display text-xl italic"><span className="rt-special">Troféer</span></h3>
        <span className="text-xs" style={{ color: "var(--text2)" }}>Special · en Copy var · räknas inte i x/y</span>
      </div>
      <div className={`grid ${cols} gap-3`}>
        {specials.map((c) => {
          const who = specialOwner(c, owned);
          const mine = who === "Du";
          return (
            <div key={c.id} className="text-center">
              <CardFrame card={c} owned={!!who} />
              <p className="mt-1 truncate text-xs font-medium">{c.name}</p>
              <p className="truncate text-[11px]" style={{ color: mine ? "var(--accent)" : "var(--text2)" }}>{who ? (mine ? "Din trofé" : `Ägs av ${who}`) : "Ingen äger den än"}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

export function Empty({ icon, title, body, cta, onCta }: { icon: string; title: string; body?: string; cta?: string; onCta?: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-8 text-center" style={{ borderColor: "var(--line-strong)" }}>
      <div className="grid h-14 w-14 place-items-center rounded-full text-2xl" style={{ background: "var(--surf2)" }}>{icon}</div>
      <p className="font-display mt-3 text-xl italic">{title}</p>
      {body && <p className="mt-1 max-w-[30ch] text-sm" style={{ color: "var(--text2)" }}>{body}</p>}
      {cta && <button onClick={onCta} className="mt-4 h-11 rounded-full px-5 text-sm font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>{cta}</button>}
    </div>
  );
}

// ── Style sheet screen (?skarm=stil) ─────────────────────────────────────────

function lum(hex: string) {
  const c = hex.replace("#", "").match(/../g)!.map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function ratio(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return ((x + 0.05) / (y + 0.05)).toFixed(1);
}
const PAL: Record<Tema, Record<string, string>> = {
  A: { bg: "#1f1513", surf: "#2c1f1b", text: "#f4e8d6", text2: "#bfa992", accent: "#ff7a59" },
  B: { bg: "#1c1411", surf: "#211814", text: "#f6ecdc", text2: "#c4ae96", accent: "#f5b544" },
  C: { bg: "#120c0a", surf: "#2e211c", text: "#fbf1e3", text2: "#c9b39b", accent: "#ff6b4a" },
};
const RAR_HEX: Record<string, string> = { common: "#b5a595", rare: "#5aa9ff", epic: "#b98cff", legendary: "#f2c35b", gem: "#7ee8ff" };

export function Stilark({ owned, wide }: { owned: Record<string, number>; wide?: boolean }) {
  const [tema] = useTema();
  const col = collections[0].id;
  const pick = (r: CardRarity, n = 0) => cardsIn(col).filter((c) => c.rarity === r)[n] ?? cardsIn(collections[1]?.id ?? col).find((c) => c.rarity === r)!;
  const ladder = (["common", "rare", "epic", "legendary", "special"] as CardRarity[]).map((r) => pick(r)).filter(Boolean);
  const pal = PAL[tema];
  const H = ({ children }: { children: ReactNode }) => <h2 className="font-display mb-3 mt-8 text-2xl italic">{children}</h2>;
  return (
    <div className={`px-4 pb-10 pt-4 ${wide ? "mx-auto max-w-4xl" : ""}`}>
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--text2)" }}>Stilark · tema {tema} · {TEMAS[tema]}</p>
      <div className="mt-2"><Wordmark size={34} /></div>
      <p className="font-display mt-3 text-3xl">Kumla GP</p>
      <p className="font-display text-2xl italic">Åsa & Örjan dansar bugg</p>
      <p className="mt-1 text-base">Brödtext 16 px i DM Sans: långa listor, regler och knappar.</p>
      <p className="text-sm" style={{ color: "var(--text2)" }}>Sekundär text 14 px · <span className="text-[11px] font-bold uppercase tracking-wider">Etikett 11 px</span></p>

      <H>Färger och kontrast</H>
      <div className="grid grid-cols-5 gap-2 text-center text-[11px]">
        {Object.entries(pal).map(([k, v]) => (
          <div key={k}><div className="h-12 rounded-lg" style={{ background: v, boxShadow: "inset 0 0 0 1px var(--line-strong)" }} /><p className="mt-1">{k}</p><p style={{ color: "var(--text2)" }}>{v}</p></div>
        ))}
      </div>
      <ul className="mt-3 space-y-1 text-sm" style={{ color: "var(--text2)" }}>
        <li>Text på bakgrund: <b style={{ color: "var(--text)" }}>{ratio(pal.text, pal.bg)}:1</b> · sekundär text: <b style={{ color: "var(--text)" }}>{ratio(pal.text2, pal.bg)}:1</b></li>
        <li>Text på knapp (accent): <b style={{ color: "var(--text)" }}>{ratio(pal.bg, pal.accent)}:1</b> · accent som text på yta: <b style={{ color: "var(--text)" }}>{ratio(pal.accent, pal.surf)}:1</b></li>
        <li>Rarity på bakgrund: {Object.entries(RAR_HEX).map(([k, v]) => <span key={k} className="mr-2"><span style={{ color: v }}>{k}</span> {ratio(v, pal.bg)}</span>)}</li>
      </ul>

      <H>Card-ram per Rarity</H>
      <div className={`grid gap-3 ${wide ? "grid-cols-7" : "grid-cols-4"}`}>
        {ladder.map((c) => <div key={c.id}><CardFrame card={c} /><p className={`mt-1 text-center text-[11px] font-bold uppercase tracking-wider rt-${c.rarity}`}>{rarityLabel[c.rarity]}</p></div>)}
        <div><CardFrame card={pick("epic", 1)} noArt /><p className="mt-1 text-center text-[11px]" style={{ color: "var(--text2)" }}>Bild saknas</p></div>
        <div><CardFrame card={pick("rare", 1)} owned={false} /><p className="mt-1 text-center text-[11px]" style={{ color: "var(--text2)" }}>Saknas</p></div>
        <div><CardFrame card={pick("legendary", 1)} selected /><p className="mt-1 text-center text-[11px]" style={{ color: "var(--text2)" }}>Vald (byte)</p></div>
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--text2)" }}>Rarity syns aldrig bara som färg: ● Common ◆ Rare ▲ Epic ★ Legendary ✦ Special{tema === "B" ? " (här som bildtext under bilden)" : ""}.</p>

      <H>Märken</H>
      <div className="flex flex-wrap items-center gap-3">
        <BadgeNy /><BadgeHar /><BadgeHar have={3} />
        <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full px-1 text-[10px] font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>2</span>
        <span className="h-2 w-2 rounded-full" style={{ background: "var(--accent)" }} />
        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: "var(--ok-soft)", color: "var(--ok)" }}>Ni kan byta med varandra</span>
        <Diamonds n={1240} />
      </div>

      <H>Knappar</H>
      <div className="flex flex-wrap gap-2">
        <button className="h-12 rounded-full px-5 font-bold" style={{ background: "var(--accent)", color: "var(--on-accent)" }}>Öppna Pack · 100</button>
        <button className="h-12 rounded-full border px-5 font-bold" style={{ borderColor: "var(--accent-line)", color: "var(--accent)" }}>500 <DiamondIcon size={16} /></button>
        <button disabled className="h-12 rounded-full px-5 font-bold" style={{ background: "var(--surf2)", color: "var(--text3)" }}>Saknar 12</button>
      </div>

      <H>Poängtavla · SM 2026</H>
      <Scoreboard p={{ have: 149, total: 215, rarity: { common: { have: 140, total: 193 }, rare: { have: 6, total: 11 }, epic: { have: 2, total: 6 }, legendary: { have: 1, total: 5 }, special: { have: 0, total: 0 } } }} />

      <div className="h-8" />
      <TrophyShelf collectionId={collections.find((c) => cardsIn(c.id).some((x) => x.rarity === "special"))?.id ?? col} owned={owned} cols={wide ? "grid-cols-6" : "grid-cols-3"} />

      <H>Tomma lägen</H>
      <div className={`grid gap-3 ${wide ? "grid-cols-3" : ""}`}>
        <Empty icon="☕" title="Allt hämtat för idag" body="Dagens diamanter, kistor och mål är klara. Kom tillbaka imorgon." />
        <Empty icon="🃏" title="Inga dubbletter än" body="Öppna fler Packs i SM 2026 så dyker dubbletter upp här." cta="Till Butik" />
        <Empty icon="⇄" title="Inga matchningar just nu" body="Ingen har något du saknar tillgängligt. Prova Hitta byte från ett Card du saknar." />
      </div>
    </div>
  );
}
