import type { CollectionProgress } from "../../types/game";

const CELLS = [
  ["common", "Common", "bg-rarity-common"],
  ["rare", "Rare", "bg-rarity-rare"],
  ["epic", "Epic", "bg-rarity-epic"],
  ["legendary", "Legendary", "bg-rarity-legendary"],
] as const;

/** Per-Rarity "owned of total" scoreboard for one Collection. Special is left out. */
export function CollectionScoreboard({ progress }: { progress: CollectionProgress | undefined }) {
  return (
    <ul className="grid grid-cols-4 gap-2">
      {CELLS.map(([key, label, bar]) => {
        const c = progress?.byRarity[key];
        return (
          <li key={key} className="relative overflow-hidden rounded-lg bg-raised px-1 pb-2 pt-3 text-center">
            <span className={`absolute inset-x-0 top-0 h-[3px] ${bar}`} aria-hidden />
            <p className="font-display text-xl leading-none tabular-nums">{c?.owned ?? 0}</p>
            <p className="mt-0.5 text-xs tabular-nums text-secondary">av {c?.total ?? 0}</p>
            <p className="mt-1 text-[11px] font-bold uppercase tracking-wider text-tertiary">{label}</p>
          </li>
        );
      })}
    </ul>
  );
}
