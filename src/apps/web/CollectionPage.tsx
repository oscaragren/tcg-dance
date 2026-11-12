import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown } from "lucide-react";
import { AchievementsSection } from "../../components/web/AchievementsSection";
import { CardGrid } from "../../components/web/CardGrid";
import { CardSheet } from "../../components/web/CardSheet";
import { CardThumb } from "../../components/web/CardThumb";
import { UpgradeRevealModal } from "../../components/web/UpgradeRevealModal";
import { UpgradeScreen } from "../../components/web/UpgradeScreen";
import { Button } from "../../components/shared/ui/button";
import { cards, type CardRarity, type DanceCard } from "../../data/cards";
import { collections } from "../../data/packs";
import { rarityColor, rarityLabel } from "../../data/rarity";
import { fetchCollectionProgress, fetchGameState, fetchTrophies, markCollectionViewed, setCardKept, upgradeCards } from "../../utils/gameApi";
import { useIsDesktop } from "../../utils/useMediaQuery";
import { upgradeCardsRequired, upgradeTierTarget, type CollectionProgress, type Trophy } from "../../types/game";

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
  const [upgradeRarity, setUpgradeRarity] = useState<CardRarity | null>(null);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [revealCard, setRevealCard] = useState<DanceCard | null>(null);
  const desktop = useIsDesktop();

  useEffect(() => {
    if (!userEmail) { setOwnedCardIds([]); setKeptCardIds(new Set()); return; }
    markCollectionViewed().catch(() => undefined); // Starter step "Kolla din Samling"
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

  // Per-Collection progress for the sidebar list (Special Cards are not counted).
  const collectionProgress = useMemo(
    () =>
      collections.map((c) => {
        const list = cards.filter((card) => card.collectionId === c.id && card.rarity !== "special");
        return { id: c.id, label: c.label, owned: list.filter((card) => (copies.get(card.id) ?? 0) > 0).length, total: list.length };
      }),
    [copies],
  );

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

  // The Cards as laid out on screen (open sections only, search and view respected): what swiping in the sheet walks through.
  const navigable = useMemo(
    () => sections.filter((s) => !closed.has(s.rarity)).flatMap((s) => s.items.map((i) => i.card)),
    [sections, closed],
  );
  const selectedIndex = selected ? navigable.findIndex((c) => c.id === selected.id) : -1;
  const goPrev = useCallback(() => { if (selectedIndex > 0) setSelected(navigable[selectedIndex - 1]); }, [selectedIndex, navigable]);
  const goNext = useCallback(() => { if (selectedIndex >= 0 && selectedIndex < navigable.length - 1) setSelected(navigable[selectedIndex + 1]); }, [selectedIndex, navigable]);

  // Duplicates of Cards not set to Behåll, per Rarity: what an Upgrade can spend.
  const spareByRarity = useMemo(() => {
    const out: Partial<Record<CardRarity, number>> = {};
    for (const c of collectionCards) {
      const n = copies.get(c.id) ?? 0;
      if (n > 1 && !keptCardIds.has(c.id)) out[c.rarity] = (out[c.rarity] ?? 0) + n - 1;
    }
    return out;
  }, [collectionCards, copies, keptCardIds]);

  async function confirmUpgrade(cardIds: string[]) {
    if (isUpgrading) return;
    setIsUpgrading(true);
    setUpgradeError(null);
    try {
      const response = await upgradeCards(cardIds);
      setOwnedCardIds(response.state.ownedCardIds);
      setKeptCardIds(new Set(response.state.keptCardIds));
      setUpgradeRarity(null);
      setRevealCard(response.upgradedCard);
    } catch (e) {
      setUpgradeError(e instanceof Error ? e.message : "Kunde inte uppgradera korten.");
    } finally {
      setIsUpgrading(false);
    }
  }

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
      <div className="sticky top-14 z-40 border-b lg:hidden bg-background/95 backdrop-blur-sm">
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

      <div className="container mx-auto max-w-7xl px-4 lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-8 lg:px-6">
        {desktop && (
          <aside aria-label="Samling" className="sticky top-[4.5rem] hidden max-h-[calc(100vh-5.5rem)] space-y-5 self-start overflow-y-auto py-5 lg:block">
            <nav aria-label="Samlingar" className="space-y-1">
              {collectionProgress.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCollectionId(c.id)}
                  aria-current={c.id === collectionId ? "true" : undefined}
                  className={`block w-full rounded-md px-3 py-2 text-left ${c.id === collectionId ? "bg-surface ring-1 ring-hairline-strong" : "hover:bg-surface"}`}
                >
                  <span className="flex items-baseline justify-between gap-2 text-sm font-semibold">
                    <span className="truncate">{c.label}</span>
                    <span className="shrink-0 tabular-nums text-text">{c.owned}/{c.total}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-raised">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${pct(c.owned, c.total)}%` }} />
                  </span>
                </button>
              ))}
            </nav>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Sök kort"
              aria-label="Sök kort"
              className="h-11 w-full rounded-md border border-hairline px-3 text-sm"
            />
            <div role="tablist" aria-label="Visa" className="flex rounded-md bg-surface p-0.5">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={view === v.id}
                  onClick={() => setView(v.id)}
                  className={`h-9 flex-1 rounded px-2 text-sm font-medium ${view === v.id ? "bg-accent text-accent-on" : "text-secondary"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
            <nav aria-label="Hoppa till Rarity">
              <h2 className="mb-1 text-xs font-semibold uppercase tracking-wider text-secondary">Rarity</h2>
              <ul>
                {SECTION_RARITIES.map((r) => {
                  const c = progress?.byRarity[r];
                  return (
                    <li key={r}>
                      <button
                        type="button"
                        onClick={() => document.getElementById(`rarity-${r}`)?.scrollIntoView({ behavior: "smooth", block: "start" })}
                        className="flex h-10 w-full items-center justify-between gap-2 rounded-md px-3 text-sm hover:bg-surface"
                        style={{ borderLeft: `3px solid ${rarityColor(r)}` }}
                      >
                        <span className="font-medium">{rarityLabel[r]}</span>
                        <span className="tabular-nums text-text">{c ? `${c.owned}/${c.total}` : "–"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <AchievementsSection collectionId={collectionId} />
          </aside>
        )}
        <div className={`min-w-0 space-y-6 pt-5 ${desktop && (selected || upgradeRarity) ? "lg:pr-[27rem]" : ""}`}>
        {error && <p className="text-sm text-danger">{error}</p>}

        {/* Scoreboard: cream Totalt cell, one cell per Rarity, no Special. */}
        <div className="grid grid-cols-5 gap-2 lg:hidden" aria-label="Poängtavla">
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
            const next = upgradeTierTarget[s.rarity];
            const needed = upgradeCardsRequired[s.rarity];
            const have = spareByRarity[s.rarity] ?? 0;
            return (
              <section key={s.rarity} id={`rarity-${s.rarity}`} className="scroll-mt-20">
                <div className="mb-2 flex w-full items-center justify-between" style={{ borderBottom: `2px solid ${rarityColor(s.rarity)}` }}>
                  <button
                    type="button"
                    onClick={() => toggle(s.rarity)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <h2 className="font-display text-lg font-semibold">{rarityLabel[s.rarity]} {s.owned}/{s.total}</h2>
                    <ChevronDown className={`h-5 w-5 text-secondary transition-transform ${open ? "" : "-rotate-90"}`} aria-hidden />
                  </button>
                  {next && needed ? (
                    <button
                      type="button"
                      onClick={() => { setUpgradeError(null); setUpgradeRarity(s.rarity); }}
                      className={`shrink-0 rounded px-2 py-1 text-sm font-semibold tabular-nums ${have >= needed ? "text-accent" : "text-secondary"}`}
                    >
                      ↑ {rarityLabel[next]} · {have}/{needed}
                    </button>
                  ) : null}
                </div>
                {open && <CardGrid items={s.items} onSelect={setSelected} className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-6" />}
              </section>
            );
          })
        )}

        {!desktop && <AchievementsSection collectionId={collectionId} />}

        </div>
      </div>

      {upgradeRarity && (
        <UpgradeScreen
          collectionId={collectionId}
          rarity={upgradeRarity}
          ownedCardIds={ownedCardIds}
          keptCardIds={keptCardIds}
          isSubmitting={isUpgrading}
          error={upgradeError}
          onConfirm={confirmUpgrade}
          onClose={() => setUpgradeRarity(null)}
        />
      )}
      {revealCard && <UpgradeRevealModal card={revealCard} onClose={() => setRevealCard(null)} />}

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
          onPrev={selectedIndex > 0 ? goPrev : undefined}
          onNext={selectedIndex >= 0 && selectedIndex < navigable.length - 1 ? goNext : undefined}
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
