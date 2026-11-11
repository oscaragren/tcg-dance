import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import { CardThumb } from "./CardThumb";
import { cardById, rarityOrder, type CardRarity } from "../../data/cards";
import { collections } from "../../data/packs";
import { rarityLabel } from "../../data/rarity";
import type { CardForTrade, TradeMatch } from "../../types/game";
import { fetchTradeMatches } from "../../utils/gameApi";

type Sort = "namn" | "raritet";

const newTradeLink = (m: TradeMatch) => `/byte/ny?anvandare=${m.userId}&namn=${encodeURIComponent(m.username)}`;

/** "2 Common · 1 Rare", rarest first. */
function raritySummary(items: CardForTrade[]): string {
  const counts = new Map<CardRarity, number>();
  for (const { cardId, quantity } of items) {
    const card = cardById(cardId);
    if (card) counts.set(card.rarity, (counts.get(card.rarity) ?? 0) + quantity);
  }
  return [...counts.entries()]
    .sort((a, b) => rarityOrder[a[0]] - rarityOrder[b[0]])
    .map(([rarity, n]) => `${n} ${rarityLabel[rarity]}`)
    .join(" · ");
}

/** The Trade page's default tab: players who have Cards you are missing, two-way matches first. */
export function MatchningarTab() {
  const [matches, setMatches] = useState<TradeMatch[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collectionId, setCollectionId] = useState("all");
  const [sort, setSort] = useState<Sort>("raritet");

  useEffect(() => {
    fetchTradeMatches()
      .then((r) => setMatches(r.matches))
      .catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda matchningar."));
  }, []);

  // Filter and sort only the Card strips; the ranking of players stays server-side.
  const strip = useMemo(() => (items: CardForTrade[]) =>
    items
      .map((i) => ({ ...i, card: cardById(i.cardId) }))
      .filter((i) => i.card && (collectionId === "all" || i.card.collectionId === collectionId))
      .sort((a, b) =>
        sort === "namn"
          ? a.card!.name.localeCompare(b.card!.name, "sv")
          : rarityOrder[a.card!.rarity] - rarityOrder[b.card!.rarity] || a.card!.name.localeCompare(b.card!.name, "sv")),
  [collectionId, sort]);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!matches) return <p className="text-secondary">Laddar...</p>;
  if (matches.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-hairline-strong bg-surface p-8 text-center text-secondary">
        Inga matchningar just nu. Ingen har något du saknar att byta bort. Prova Sök spelare, eller kom tillbaka senare.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 text-sm">
        <label className="flex items-center gap-2">
          Kollektion
          <select value={collectionId} onChange={(e) => setCollectionId(e.target.value)} className="h-9 rounded-md border border-hairline bg-surface px-2">
            <option value="all">Alla</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">
          Sortera
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-9 rounded-md border border-hairline bg-surface px-2">
            <option value="raritet">Raritet</option>
            <option value="namn">Namn</option>
          </select>
        </label>
      </div>

      {matches.map((m) => {
        const theirs = strip(m.theyCanGive);
        return (
          <section key={m.userId} className="rounded-2xl border bg-surface p-5">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{m.username}</div>
                {m.twoWay && <div className="text-xs font-medium text-success">Ni kan byta med varandra</div>}
              </div>
              <Button asChild size="sm" className="shrink-0 bg-accent text-accent-on hover:bg-accent">
                <Link to={newTradeLink(m)}>Byt</Link>
              </Button>
            </div>
            <p className="mt-3 text-xs text-secondary">Kan ge dig ({m.theyCanGive.length} kort du saknar)</p>
            {theirs.length === 0 ? (
              <p className="mt-2 text-xs text-tertiary">Inga kort i den valda kollektionen.</p>
            ) : (
              <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
                {theirs.map(({ cardId, quantity, card }) => (
                  <div key={cardId} className="w-16 shrink-0">
                    <CardThumb card={card!} copies={quantity} />
                  </div>
                ))}
              </div>
            )}
            {m.twoWay && (
              <p className="mt-3 text-xs text-secondary">
                Du kan ge: <span className="font-medium text-text">{raritySummary(m.youCanGive)}</span>
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}
