import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cards, type CardRarity } from "../../data/cards";
import { rarityLabel } from "../../data/rarity";
import { upgradeTierTarget, type UpgradePick } from "../../types/game";
import { fetchUpgradePick } from "../../utils/gameApi";
import { useIsDesktop } from "../../utils/useMediaQuery";
import { Button } from "../shared/ui/button";
import { CardThumb } from "./CardThumb";

type UpgradeScreenProps = {
  collectionId: string;
  rarity: CardRarity;
  ownedCardIds: string[];
  keptCardIds: Set<string>;
  isSubmitting: boolean;
  error: string | null;
  onConfirm: (cardIds: string[]) => void;
  onClose: () => void;
};

/**
 * Full-screen Upgrade list on a phone, right side panel at ≥1024px. The game has already picked Duplicates (never an
 * only Copy, skipping Behåll); the player adjusts with −/+ before confirming.
 */
export function UpgradeScreen({ collectionId, rarity, ownedCardIds, keptCardIds, isSubmitting, error, onConfirm, onClose }: UpgradeScreenProps) {
  const [pick, setPick] = useState<UpgradePick | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, number>>({});
  const desktop = useIsDesktop();

  useEffect(() => {
    let cancelled = false;
    fetchUpgradePick(collectionId, rarity)
      .then((p) => {
        if (cancelled) return;
        setPick(p);
        const initial: Record<string, number> = {};
        for (const id of p.cardIds) initial[id] = (initial[id] ?? 0) + 1;
        setSelected(initial);
      })
      .catch((e) => { if (!cancelled) setLoadError(e instanceof Error ? e.message : "Kunde inte ladda uppgraderingen."); });
    return () => { cancelled = true; };
  }, [collectionId, rarity]);

  // Spare Copies per Card: Duplicates of Cards not set to Behåll.
  const spare = useMemo(() => {
    const owned: Record<string, number> = {};
    for (const id of ownedCardIds) owned[id] = (owned[id] ?? 0) + 1;
    const out: Record<string, number> = {};
    for (const [id, n] of Object.entries(owned)) if (n > 1 && !keptCardIds.has(id)) out[id] = n - 1;
    return out;
  }, [ownedCardIds, keptCardIds]);

  const rows = useMemo(
    () =>
      cards
        .filter((c) => c.collectionId === collectionId && c.rarity === rarity && (spare[c.id] ?? 0) > 0)
        .sort((a, b) => a.name.localeCompare(b.name, "sv")),
    [collectionId, rarity, spare],
  );

  const total = Object.values(selected).reduce((n, v) => n + v, 0);
  const cost = pick?.cost ?? 0;
  const target = upgradeTierTarget[rarity];

  function adjust(cardId: string, delta: number) {
    setSelected((prev) => {
      const current = prev[cardId] ?? 0;
      const next = Math.max(0, Math.min(spare[cardId] ?? 0, current + delta));
      if (delta > 0 && total >= cost) return prev;
      return { ...prev, [cardId]: next };
    });
  }

  function confirm() {
    const ids: string[] = [];
    for (const [id, n] of Object.entries(selected)) for (let i = 0; i < n; i++) ids.push(id);
    onConfirm(ids);
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-raised lg:inset-y-0 lg:left-auto lg:right-0 lg:w-[28rem] lg:border-l lg:shadow-2xl" role="dialog" aria-modal={!desktop} aria-label="Uppgradera">
      <header className="flex items-center justify-between border-b bg-surface px-4 py-3">
        <div>
          <h2 className="font-display text-lg font-semibold">
            {rarityLabel[rarity]} → {target ? rarityLabel[target] : ""}
          </h2>
          <p className="text-xs text-secondary">
            Kostar {cost || "…"} dubbletter. Spelet har valt åt dig, justera med − och +.
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Stäng" className="rounded p-2 text-secondary" disabled={isSubmitting}>
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        {(loadError || error) && <p className="mb-3 text-sm text-danger">{loadError ?? error}</p>}
        {pick && !pick.canUpgrade && (
          <p className="mb-3 text-sm text-secondary">
            {pick.have < pick.needed
              ? `Du har ${pick.have} av ${pick.needed} dubbletter som behövs.`
              : "Det finns inga kort kvar att uppgradera till just nu."}
          </p>
        )}
        <ul className="mx-auto grid max-w-3xl grid-cols-1 gap-2">
          {rows.map((card) => {
            const n = selected[card.id] ?? 0;
            const max = spare[card.id] ?? 0;
            return (
              <li key={card.id} className="flex items-center gap-3 rounded-lg bg-surface p-2">
                <div className="w-14 shrink-0"><CardThumb card={card} copies={max + 1} showName={false} /></div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{card.name}</div>
                  <div className="text-xs text-secondary">{max} dubbletter</div>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => adjust(card.id, -1)} disabled={n === 0 || isSubmitting}
                    aria-label={`Minska ${card.name}`} className="h-9 w-9 rounded-md border text-lg disabled:opacity-40">−</button>
                  <span className="w-8 text-center text-sm font-semibold tabular-nums">{n}</span>
                  <button type="button" onClick={() => adjust(card.id, 1)} disabled={n >= max || total >= cost || isSubmitting}
                    aria-label={`Öka ${card.name}`} className="h-9 w-9 rounded-md border text-lg disabled:opacity-40">+</button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="sticky bottom-0 flex items-center justify-between gap-3 border-t bg-surface px-4 py-3">
        <span className="text-sm font-semibold tabular-nums">Valda {total} / {cost}</span>
        <Button
          disabled={!pick?.canUpgrade || total !== cost || isSubmitting}
          onClick={confirm}
          className="bg-accent hover:bg-accent text-accent-on"
        >
          {isSubmitting ? "Uppgraderar..." : `Uppgradera till ${target ? rarityLabel[target] : ""}`}
        </Button>
      </footer>
    </div>,
    document.body,
  );
}
