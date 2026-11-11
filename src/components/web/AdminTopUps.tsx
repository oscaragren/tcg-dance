import { useState } from "react";
import { Button } from "../shared/ui/button";
import { cardById } from "../../data/cards";
import {
  approveAdminTopUp,
  dismissAdminTopUp,
  topUpAdminNow,
  type AdminBanner,
  type AdminPoolSkew,
  type AdminPoolSkewRow,
} from "../../utils/adminApi";

const RARITIES = ["common", "rare", "epic", "legendary", "special"];
const SOURCE_LABEL = { approved: "Godkänd", manual: "Manuell", event: "Event" } as const;

const cardName = (id: string) => cardById(id)?.name ?? id;
const percent = (share: number | null) => (share === null ? "–" : `${(share * 100).toFixed(1)} %`);

/** Banners at the top of the admin overview: pending or fired Top-ups, sold-out Rarities. */
export function AdminBanners({ banners, labels }: { banners: AdminBanner[]; labels: Record<string, string> }) {
  if (banners.length === 0) return null;
  const label = (id: string) => labels[id] ?? id;
  return (
    <div className="space-y-2">
      {banners.map((b, i) => {
        const text =
          b.kind === "topup_pending"
            ? `Top-up väntar i ${label(b.collectionId)}: ${b.rare} Rare + ${b.epic} Epic föreslås.`
            : b.kind === "topup_fired"
              ? `Top-up genomförd i ${label(b.collectionId)} (${SOURCE_LABEL[b.source]}): ${b.rare} Rare + ${b.epic} Epic.`
              : `Alla ${b.rarity}-kort är slutsålda i ${label(b.collectionId)}.`;
        const tone = b.kind === "topup_fired" ? "bg-raised text-text" : "bg-rarity-legendary/15 text-rarity-legendary";
        return <p key={i} className={`rounded-xl px-4 py-2 text-sm font-medium ${tone}`}>{text}</p>;
      })}
    </div>
  );
}

function amountInput(value: string, onChange: (v: string) => void, label: string) {
  return (
    <label className="flex items-center gap-1 text-xs text-secondary">
      {label}
      <input
        type="number" min={0} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)}
        className="w-20 rounded-md border bg-surface px-2 py-1 text-sm text-text"
      />
    </label>
  );
}

function CollectionSkew({ row, thresholds, onChanged }: { row: AdminPoolSkewRow; thresholds: AdminPoolSkew["thresholds"]; onChanged: () => void }) {
  const [rare, setRare] = useState(String(row.pending?.rare ?? 0));
  const [epic, setEpic] = useState(String(row.pending?.epic ?? 0));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCards, setShowCards] = useState(false);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try { await action(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Något gick fel."); } finally { setBusy(false); }
  }
  const amounts: [number, number] = [Number(rare), Number(epic)];
  const share = row.rarePlusShare;
  const bar = Math.min(100, (share ?? 0) * 100 / (thresholds.target * 2)); // scale: full bar = 2x target

  return (
    <div className="rounded-xl border bg-surface p-4 space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{row.label}</h3>
        <span className={share !== null && share < thresholds.trigger ? "text-sm font-semibold text-danger" : "text-sm text-secondary"}>
          Rare+ {percent(share)} av {row.totalRemaining} kvar
        </span>
      </div>

      <div className="relative h-2 rounded-full bg-raised" aria-hidden>
        <div className="h-2 rounded-full bg-accent" style={{ width: `${bar}%` }} />
        <div className="absolute top-[-3px] h-[14px] w-px bg-danger" style={{ left: `${thresholds.trigger / (thresholds.target * 2) * 100}%` }} title={`${thresholds.trigger * 100} %`} />
        <div className="absolute top-[-3px] h-[14px] w-px bg-text" style={{ left: "50%" }} title={`${thresholds.target * 100} %`} />
      </div>
      <p className="text-xs text-tertiary">Streck: {thresholds.trigger * 100} % (Top-up föreslås) och {thresholds.target * 100} % (mål).</p>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {RARITIES.filter((r) => r in row.remaining).map((r) => (
          <span key={r}><span className="capitalize text-secondary">{r}</span> {row.remaining[r]}</span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {amountInput(rare, setRare, "Rare")}
        {amountInput(epic, setEpic, "Epic")}
        {row.pending ? (
          <>
            <Button size="sm" disabled={busy} onClick={() => void run(() => approveAdminTopUp(row.collectionId, ...amounts))}>Godkänn</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => dismissAdminTopUp(row.collectionId))}>Avfärda</Button>
          </>
        ) : (
          <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => topUpAdminNow(row.collectionId, ...amounts))}>Top-up nu</Button>
        )}
      </div>
      {row.pending && <p className="text-xs text-secondary">En Top-up väntar. Ändra antalen vid behov innan du godkänner.</p>}
      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="text-sm">
        <p className="font-medium">Top-up-historik</p>
        {row.topUps.length === 0 ? (
          <p className="text-secondary">Inga Top-ups ännu.</p>
        ) : (
          <ul className="text-secondary">
            {row.topUps.map((t) => (
              <li key={t.id}>{new Date(t.at).toLocaleString("sv-SE")} — {t.rare} Rare + {t.epic} Epic ({SOURCE_LABEL[t.source]})</li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm">
        <button className="text-accent underline" onClick={() => setShowCards((v) => !v)}>
          Slutsålda kort ({row.soldOutCards.length})
        </button>
        {showCards && (
          <ul className="mt-1 text-secondary">
            {row.soldOutCards.length === 0
              ? <li>Inga.</li>
              : row.soldOutCards.map((c) => <li key={c.cardId}>{cardName(c.cardId)} <span className="capitalize">({c.rarity})</span></li>)}
          </ul>
        )}
      </div>
    </div>
  );
}

/** One card per live Collection: where its pool stands and what the admin can do about it. */
export function PoolSkewView({ skew, onChanged }: { skew: AdminPoolSkew | null; onChanged: () => void }) {
  if (!skew) return null;
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-semibold text-text">Poolbalans per samling</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {skew.collections.map((row) => (
          // Re-key on the pending amounts so the inputs follow the re-checked suggestion.
          <CollectionSkew key={`${row.collectionId}:${row.pending?.rare}:${row.pending?.epic}`} row={row} thresholds={skew.thresholds} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}
