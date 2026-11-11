import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { AchievementsSection } from "../../components/web/AchievementsSection";
import { CardGrid } from "../../components/web/CardGrid";
import { CardSheet } from "../../components/web/CardSheet";
import { CardThumb } from "../../components/web/CardThumb";
import { Button } from "../../components/shared/ui/button";
import { cards, type CardRarity, type DanceCard } from "../../data/cards";
import { collections } from "../../data/packs";
import { rarityColor, rarityLabel } from "../../data/rarity";
import { fetchCollectionProgress, fetchGameState, fetchTrophies, setCardKept } from "../../utils/gameApi";
import type { CollectionProgress, Trophy } from "../../types/game";

type View = "alla" | "saknas" | "dubbletter";
type GridRarity = Exclude<CardRarity, "special">;

const VIEWS: { id: View; label: string }[] = [
  { id: "alla", label: "Alla" },
  { id: "saknas", label: "Saknas" },
  { id: "dubbletter", label: "Dubbletter" },
];
// Special has no grid section: those Cards live on the Troféer shelf.
const SECTION_RARITIES: GridRarity[] = ["legendary", "epic", "rare", "common"];

const pct = (owned: number, total: number) => (total === 0 ? 0 : Math.round((owned / total) * 100));

export function CollectionPage({ userEmail }: { userEmail: string | null }) {
  const [collectionId, setCollectionId] = useState<string>(collections[collections.length - 1]?.id ?? "");
  const [view, setView] = useState<View>("alla");
  const [query, setQuery] = useState("");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<DanceCard | null>(null);
  const [ownedCardIds, setOwnedCardIds] = useState<string[]>([]);
  const [keptCardIds, setKeptCardIds] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<CollectionProgress | null>(null);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userEmail) { setOwnedCardIds([]); setKeptCardIds(new Set()); return; }
    let cancelled = false;
    setIsLoading(true);
    setError(null);
    Promise.all([fetchGameState(), fetchTrophies()])
      .then(([state, t]) => { if (!cancelled) { setOwnedCardIds(state.ownedCardIds); setKeptCardIds(new Set(state.keptCardIds)); setTrophies(t); } })
      .catch((e) => { if (!cancelled) setError(e instanceof Error ? e.message : "Kunde inte ladda samlingen."); })
      .finally(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, [userEmail]);

  useEffect(() => {
    if (!userEmail || !collectionId) return;
    let cancelled = false;
    fetchCollectionProgress(collectionId)
      .then((p) => { if (!cancelled) setProgress(p); })
      .catch(() => { if (!cancelled) setProgress(null); });
    return () => { cancelled = true; };
  }, [userEmail, collectionId, ownedCardIds]);

  const copies = useMemo(() => {
    const m = new Map<string, number>();
    for (const id of ownedCardIds) m.set(id, (m.get(id) ?? 0) + 1);
    return m;
  }, [ownedCardIds]);

  const collectionCards = useMemo(() => cards.filter((c) => c.collectionId === collectionId), [collectionId]);

  const sections = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("sv");
    const matches = (c: DanceCard) =>
      !q || [c.name, c.club, c.danceStyle, c.event].some((f) => f?.toLocaleLowerCase("sv").includes(q));
    const passesView = (c: DanceCard) => {
      const n = copies.get(c.id) ?? 0;
      return view === "alla" || (view === "saknas" ? n === 0 : n > 1);
    };
    return SECTION_RARITIES.map((rarity) => {
      const all = collectionCards.filter((c) => c.rarity === rarity);
      const shown = all
        .filter((c) => matches(c) && passesView(c))
        .sort((a, b) => a.name.localeCompare(b.name, "sv") || (a.event ?? "").localeCompare(b.event ?? "", "sv"));
      return {
        rarity,
        owned: all.filter((c) => (copies.get(c.id) ?? 0) > 0).length,
        total: all.length,
        items: shown.map((card) => ({ card, copies: copies.get(card.id) ?? 0 })),
      };
    }).filter((s) => s.total > 0);
  }, [collectionCards, copies, view, query]);

  const toggle = useCallback((rarity: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(rarity)) next.add(rarity);
      return next;
    });
  }, []);

  if (!userEmail) {
    return (
      <main className="py-16 bg-raised min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-surface border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Din samling</h1>
            <p className="text-text mb-6">Logga in eller skapa ett konto för att se dina kort.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  const shelf = trophies.filter((t) => t.collectionId === collectionId);
  const totalShown = sections.reduce((n, s) => n + s.items.length, 0);
  const total = progress?.total;

  function emptyState() {
    if (isLoading) return "Laddar samling...";
    if (query.trim()) return `Inga träffar på “${query.trim()}”.`;
    if (view === "dubbletter") return "Du har inga dubbletter.";
    if (view === "saknas") return "Inget saknas. Samlingen är komplett!";
    return "Inga kort i den här samlingen ännu.";
  }

  return (
    <main className="bg-raised min-h-[calc(100vh-72px)] pb-16">
      {/* Sticky header: Collection, overall progress, view tabs, search. */}
      <div className="sticky top-14 z-40 border-b bg-background/95 backdrop-blur-sm">
        <div className="container mx-auto max-w-6xl space-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <label htmlFor="collection-select" className="sr-only">Samling</label>
            <select
              id="collection-select"
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
              className="h-11 min-w-0 flex-1 rounded-md border border-hairline px-3 text-sm font-semibold"
            >
              {collections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-text">
              {total ? `${total.owned} / ${total.total}` : "–"}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-raised"
            role="progressbar"
            aria-label="Samlingens framsteg"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={total ? pct(total.owned, total.total) : 0}
          >
            <div className="h-full rounded-full bg-accent" style={{ width: `${total ? pct(total.owned, total.total) : 0}%` }} />
          </div>
          <div className="flex items-center gap-2">
            <div role="tablist" aria-label="Visa" className="flex shrink-0 rounded-md bg-surface p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => setView(v.id)}
                  className={`rounded px-3 text-sm font-medium ${view === v.id ? "bg-accent text-accent-on" : "text-secondary"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök kort"
              aria-label="Sök kort"
              className="h-11 min-w-0 flex-1 rounded-md border border-hairline px-3 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="container mx-auto max-w-6xl space-y-6 px-4 pt-5">
        {error && <p className="text-sm text-danger">{error}</p>}

        {/* Scoreboard: cream Totalt cell, one cell per Rarity, no Special. */}
        <div className="grid grid-cols-5 gap-2" aria-label="Poängtavla">
          <div className="rounded-lg bg-text p-2 text-center text-accent-on">
            <div className="text-[10px] font-semibold uppercase tracking-wider">Totalt</div>
            <div className="font-display text-lg font-bold tabular-nums">{total ? `${total.owned}/${total.total}` : "–"}</div>
          </div>
          {SECTION_RARITIES.map((r) => {
            const c = progress?.byRarity[r];
            return (
              <div key={r} className="rounded-lg bg-surface p-2 text-center" style={{ borderTop: `2px solid ${rarityColor(r)}` }}>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-secondary">{rarityLabel[r]}</div>
                <div className="font-display text-lg font-bold tabular-nums">{c ? `${c.owned}/${c.total}` : "–"}</div>
              </div>
            );
          })}
        </div>

        {shelf.length > 0 && (
          <section aria-labelledby="troféer">
            <h2 id="troféer" className="mb-2 text-sm font-semibold uppercase tracking-wider text-secondary">Troféer</h2>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {shelf.map((t) => {
                const card = cards.find((c) => c.id === t.cardId);
                if (!card) return null;
                return (
                  <div key={t.cardId} className="w-24 shrink-0">
                    <CardThumb card={card} copies={t.owner?.isYou ? 1 : 0} onSelect={setSelected} />
                    <p className="mt-0.5 text-center text-[10px] leading-tight text-secondary">
                      {t.owner ? (t.owner.isYou ? "Din trofé" : `Ägs av ${t.owner.username}`) : "Ingen äger den än"}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {totalShown === 0 ? (
          <div className="rounded-xl border border-dashed border-hairline-strong bg-surface p-8 text-center text-text">{emptyState()}</div>
        ) : (
          sections.filter((s) => s.items.length > 0).map((s) => {
            const open = !closed.has(s.rarity);
            return (
              <section key={s.rarity}>
                <button
                  type="button"
                  onClick={() => toggle(s.rarity)}
                  aria-expanded={open}
                  className="mb-2 flex w-full items-center justify-between text-left"
                  style={{ borderBottom: `2px solid ${rarityColor(s.rarity)}` }}
                >
                  <h2 className="font-display text-lg font-semibold">{rarityLabel[s.rarity]} {s.owned}/{s.total}</h2>
                  <ChevronDown className={`h-5 w-5 text-secondary transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
                </button>
                {open && <CardGrid items={s.items} onSelect={setSelected} />}
              </section>
            );
          })
        )}

        <AchievementsSection collectionId={collectionId} />

      </div>

      {selected && (
        <CardSheet
          card={selected}
          copies={copies.get(selected.id) ?? 0}
          kept={keptCardIds.has(selected.id)}
          onToggleKept={(keep) => {
            const cardId = selected.id;
            const apply = (k: boolean) => setKeptCardIds((prev) => { const next = new Set(prev); if (k) next.add(cardId); else next.delete(cardId); return next; });
            apply(keep);
            setCardKept(cardId, keep).catch(() => apply(!keep));
          }}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
