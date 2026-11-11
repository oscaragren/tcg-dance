import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "../shared/ui/button";
import { CardThumb } from "./CardThumb";
import { cardById, rarityOrder } from "../../data/cards";
import { collections } from "../../data/packs";
import { copyStatusLabel } from "../../utils/tradeSummary";

export type PickerEntry = {
  cardId: string;
  /** Most Copies that can be picked. */
  max: number;
  /** Copies the recipient already holds, for "Ny!" / "Har redan (×N)". */
  recipientOwned: number;
  /** Copies the giver has Available for Trade. Picking more than this reads "Inte till byte". */
  available: number;
  /** Listed first: your Available Copy of a Card the other player is missing. */
  suggested?: boolean;
};

type Sort = "raritet" | "namn";

type Props = {
  title: string;
  entries: PickerEntry[];
  selected: Record<string, number>;
  onAdjust: (cardId: string, next: number, max: number) => void;
  onClose: () => void;
  emptyMessage: string;
  /** Show "Inte till byte" on Copies beyond what is Available. */
  flagUnavailable?: boolean;
};

type ListProps = Pick<Props, "entries" | "selected" | "onAdjust" | "emptyMessage" | "flagUnavailable"> & {
  /** Grid column classes; the sheet is wide, a desktop column is narrow. */
  gridClassName?: string;
  /** Classes for the filter row, e.g. padding inside the sheet. */
  controlsClassName?: string;
};

/**
 * Collection filter, name/Rarity sort and a grid of pickable Copies. Used by
 * the phone sheet and, permanently open, by the desktop builder's columns.
 */
export function TradePickerList({
  entries, selected, onAdjust, emptyMessage, flagUnavailable = false,
  gridClassName = "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6", controlsClassName = "",
}: ListProps) {
  const [collectionId, setCollectionId] = useState("all");
  const [sort, setSort] = useState<Sort>("raritet");

  const visible = useMemo(() => {
    const withCard = entries
      .map((e) => ({ ...e, card: cardById(e.cardId) }))
      .filter((e) => e.card && (collectionId === "all" || e.card.collectionId === collectionId));
    const byOrder = (a: (typeof withCard)[number], b: (typeof withCard)[number]) =>
      sort === "namn"
        ? a.card!.name.localeCompare(b.card!.name, "sv")
        : rarityOrder[a.card!.rarity] - rarityOrder[b.card!.rarity] || a.card!.name.localeCompare(b.card!.name, "sv");
    // Suggestions stay on top whatever the sort; the sort orders within each group.
    return withCard.sort((a, b) => Number(!!b.suggested) - Number(!!a.suggested) || byOrder(a, b));
  }, [entries, collectionId, sort]);

  return (
    <>
      <div className={`flex flex-wrap gap-3 text-sm ${controlsClassName}`}>
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
      <div className="flex-1 overflow-y-auto px-4 py-4">
        {visible.length === 0 ? (
          <p className="text-sm text-tertiary">{entries.length === 0 ? emptyMessage : "Inga kort i den valda kollektionen."}</p>
        ) : (
          <div className={`grid gap-3 ${gridClassName}`}>
            {visible.map((e) => {
              const qty = selected[e.cardId] ?? 0;
              const notForTrade = flagUnavailable && e.available < Math.max(qty, 1);
              return (
                <div key={e.cardId} className={`flex flex-col gap-1 rounded-lg p-1 ${qty > 0 ? "bg-raised ring-2 ring-accent" : ""}`}>
                  <CardThumb card={e.card!} copies={1} />
                  {e.suggested && <span className="text-center text-[10px] font-medium text-success">Förslag</span>}
                  <span className={`text-center text-[10px] font-medium ${e.recipientOwned === 0 ? "text-success" : "text-secondary"}`}>
                    {copyStatusLabel(e.recipientOwned)}
                  </span>
                  {notForTrade && <span className="text-center text-[10px] font-medium text-danger">Inte till byte</span>}
                  <div className="flex items-center justify-center gap-1.5">
                    <button
                      type="button" onClick={() => onAdjust(e.cardId, qty - 1, e.max)} disabled={qty <= 0}
                      className="h-7 w-7 rounded-full border border-hairline-strong text-sm leading-none disabled:opacity-40" aria-label={`Minska ${e.card!.name}`}
                    >−</button>
                    <span className="w-8 text-center text-xs font-medium tabular-nums">{qty}/{e.max}</span>
                    <button
                      type="button" onClick={() => onAdjust(e.cardId, qty + 1, e.max)} disabled={qty >= e.max}
                      className="h-7 w-7 rounded-full border border-hairline-strong text-sm leading-none disabled:opacity-40" aria-label={`Öka ${e.card!.name}`}
                    >+</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

/** Full-height sheet for picking Copies of Cards, filterable by Collection and sortable by name or Rarity. */
export function TradePickerSheet({ title, entries, selected, onAdjust, onClose, emptyMessage, flagUnavailable = false }: Props) {
  const titleId = useId();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  const pickedTotal = Object.values(selected).reduce((s, n) => s + n, 0);

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-background" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="flex items-center gap-3 border-b px-4 py-3">
        <h2 id={titleId} className="flex-1 text-lg font-semibold">{title}</h2>
        <Button size="sm" onClick={onClose} className="bg-accent text-accent-on hover:bg-accent">
          Klar{pickedTotal > 0 ? ` (${pickedTotal})` : ""}
        </Button>
      </div>
      <TradePickerList
        entries={entries} selected={selected} onAdjust={onAdjust} emptyMessage={emptyMessage}
        flagUnavailable={flagUnavailable} controlsClassName="border-b px-4 py-2"
      />
    </div>,
    document.body,
  );
}
