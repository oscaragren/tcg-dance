import { useEffect, useState } from "react";
import { Button } from "../shared/ui/button";
import content from "../../../data/game-content.json";
import { collections } from "../../data/packs";
import {
  deleteAdminEvent,
  endAdminEvent,
  fetchAdminEvents,
  saveAdminEvent,
  type AdminEvent,
  type AdminEventDraft,
  type AdminEventStatus,
} from "../../utils/adminApi";

const BASE_DAILY: number = (content as { dailyDiamonds?: number }).dailyDiamonds ?? 150;
const CHESTS = [["bronze", "Bronskista"], ["silver", "Silverkista"], ["gold", "Guldkista"]] as const;
const DAY_MS = 24 * 3600 * 1000;
/** Guideline only: roughly this many extra Diamonds per Event day keeps the economy healthy. */
const GUIDE_MIN = 500;
const GUIDE_MAX = 700;
const STATUS_LABEL: Record<AdminEventStatus, string> = { upcoming: "Kommande", running: "Pågår", finished: "Avslutat" };

/** `<input type="datetime-local">` value (local time) <-> ISO. */
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const fromLocalInput = (v: string) => (v ? new Date(v).toISOString() : "");
const when = (iso: string) => new Date(iso).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short" });

type Form = {
  label: string; startsAt: string; endsAt: string;
  daily: string; wait: Record<string, string>; multiplier: string;
  giftKind: "" | "diamonds" | "chest"; giftAmount: string; giftChest: string; topUp: string;
};

const emptyForm = (): Form => {
  const start = new Date(Date.now() + DAY_MS);
  start.setHours(0, 0, 0, 0);
  return {
    label: "", startsAt: toLocalInput(start.toISOString()), endsAt: toLocalInput(new Date(start.getTime() + DAY_MS).toISOString()),
    daily: "", wait: {}, multiplier: "", giftKind: "", giftAmount: "", giftChest: "silver", topUp: "",
  };
};

const formFrom = (e: AdminEvent): Form => ({
  label: e.label, startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt),
  daily: e.dailyDiamonds != null ? String(e.dailyDiamonds) : "",
  wait: Object.fromEntries(Object.entries(e.chestWaitHours ?? {}).map(([k, v]) => [k, String(v)])),
  multiplier: e.chestMultiplier != null ? String(e.chestMultiplier) : "",
  giftKind: e.gift?.type ?? "", giftAmount: e.gift?.type === "diamonds" ? String(e.gift.amount) : "",
  giftChest: e.gift?.type === "chest" ? e.gift.chestType : "silver", topUp: e.topUpCollectionId ?? "",
});

function toDraft(f: Form): AdminEventDraft {
  const wait = Object.fromEntries(Object.entries(f.wait).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
  return {
    label: f.label, startsAt: fromLocalInput(f.startsAt), endsAt: fromLocalInput(f.endsAt),
    dailyDiamonds: f.daily === "" ? null : Number(f.daily),
    chestWaitHours: Object.keys(wait).length ? wait : null,
    chestMultiplier: f.multiplier === "" ? null : Number(f.multiplier),
    gift: f.giftKind === "diamonds" ? { type: "diamonds", amount: Number(f.giftAmount) }
      : f.giftKind === "chest" ? { type: "chest", chestType: f.giftChest } : null,
    topUpCollectionId: f.topUp || null,
  };
}

/** Extra Diamonds per Event day from the rewards that can be counted up front. */
function extraPerDay(f: Form): number {
  const days = Math.max(1, (Date.parse(fromLocalInput(f.endsAt)) - Date.parse(fromLocalInput(f.startsAt))) / DAY_MS || 1);
  const daily = f.daily === "" ? 0 : Math.max(0, Number(f.daily) - BASE_DAILY);
  const gift = f.giftKind === "diamonds" ? Number(f.giftAmount) || 0 : 0;
  return Math.round(daily + gift / days);
}

function describe(e: AdminEvent): string[] {
  const out: string[] = [];
  if (e.dailyDiamonds != null) out.push(`Daglig: ${e.dailyDiamonds}`);
  for (const [t, h] of Object.entries(e.chestWaitHours ?? {})) out.push(`${t}-kista ${h} h`);
  if (e.chestMultiplier != null) out.push(`Kistor ×${e.chestMultiplier}`);
  if (e.gift?.type === "diamonds") out.push(`Gåva: ${e.gift.amount} ◆`);
  if (e.gift?.type === "chest") out.push(`Gåva: ${e.gift.chestType}-kista`);
  if (e.topUpCollectionId) out.push(`Top-up: ${collections.find((c) => c.id === e.topUpCollectionId)?.label ?? e.topUpCollectionId}`);
  return out;
}

const field = "rounded-md border bg-surface px-2 py-1 text-sm text-text";

function EventBuilder({ editing, onDone, onCancel }: { editing: AdminEvent | null; onDone: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<Form>(editing ? formFrom(editing) : emptyForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const extra = extraPerDay(form);
  const guide = extra < GUIDE_MIN ? "under" : extra > GUIDE_MAX ? "över" : "inom";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try { await saveAdminEvent(editing?.id ?? null, toDraft(form)); onDone(); }
    catch (err) { setError(err instanceof Error ? err.message : "Något gick fel."); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-xl border bg-surface p-4">
      <h3 className="font-semibold">{editing ? "Ändra Event" : "Nytt Event"}</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs text-secondary sm:col-span-1">Namn
          <input className={field} value={form.label} onChange={(e) => set("label", e.target.value)} maxLength={60} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">Start
          <input type="datetime-local" className={field} value={form.startsAt} onChange={(e) => set("startsAt", e.target.value)} required />
        </label>
        <label className="flex flex-col gap-1 text-xs text-secondary">Slut
          <input type="datetime-local" className={field} value={form.endsAt} onChange={(e) => set("endsAt", e.target.value)} required />
        </label>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Belöningar (välj minst en)</legend>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Dagliga diamanter <input type="number" min={1} className={`${field} w-24`} value={form.daily} onChange={(e) => set("daily", e.target.value)} placeholder={String(BASE_DAILY)} />
          <span className="text-xs text-tertiary">Ordinarie {BASE_DAILY}. Tomt = oförändrat.</span>
        </label>
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span>Väntetid, timmar:</span>
          {CHESTS.map(([type, label]) => (
            <label key={type} className="flex items-center gap-1 text-xs text-secondary">{label}
              <input type="number" min={0} step="0.5" className={`${field} w-16`} value={form.wait[type] ?? ""}
                onChange={(e) => set("wait", { ...form.wait, [type]: e.target.value })} />
            </label>
          ))}
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Kistmultiplikator <input type="number" min={1} step="0.1" className={`${field} w-20`} value={form.multiplier} onChange={(e) => set("multiplier", e.target.value)} placeholder="×1" />
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>Inloggningsgåva</span>
          <select className={field} value={form.giftKind} onChange={(e) => set("giftKind", e.target.value as Form["giftKind"])}>
            <option value="">Ingen</option><option value="diamonds">Diamanter</option><option value="chest">Kista</option>
          </select>
          {form.giftKind === "diamonds" && <input type="number" min={1} className={`${field} w-24`} value={form.giftAmount} onChange={(e) => set("giftAmount", e.target.value)} />}
          {form.giftKind === "chest" && (
            <select className={field} value={form.giftChest} onChange={(e) => set("giftChest", e.target.value)}>
              {CHESTS.map(([type, label]) => <option key={type} value={type}>{label}</option>)}
            </select>
          )}
        </div>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Top-up när Eventet startar
          <select className={field} value={form.topUp} onChange={(e) => set("topUp", e.target.value)}>
            <option value="">Ingen</option>
            {collections.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
          <span className="text-xs text-tertiary">Siktar på 7 %, genomförs utan extra bekräftelse.</span>
        </label>
      </fieldset>

      <p className={`text-xs ${guide === "inom" ? "text-secondary" : "text-rarity-legendary"}`}>
        Riktlinje: ca {GUIDE_MIN}–{GUIDE_MAX} extra diamanter per Eventdag. Det här Eventet ger ca {extra} per dag ({guide} riktlinjen). Du kan spara ändå.
      </p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={busy}>Spara</Button>
        <Button type="button" size="sm" variant="outline" onClick={onCancel}>Avbryt</Button>
      </div>
    </form>
  );
}

/** The "Event" tab: every Event, with a builder for new ones. Lifecycle rules are enforced by the server. */
export function AdminEvents({ onChanged }: { onChanged: () => void }) {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [builder, setBuilder] = useState<{ editing: AdminEvent | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => fetchAdminEvents().then(setEvents).catch((e) => setError(e instanceof Error ? e.message : "Kunde inte ladda Event."));
  useEffect(() => { void load(); }, []);

  async function run(action: () => Promise<void>) {
    setError(null);
    try { await action(); await load(); onChanged(); } catch (e) { setError(e instanceof Error ? e.message : "Något gick fel."); }
  }

  if (!events) return <p className="pt-2 text-sm text-secondary">Laddar Event...</p>;
  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Event</h2>
        {!builder && <Button size="sm" onClick={() => setBuilder({ editing: null })}>Nytt Event</Button>}
      </div>
      {error && <p className="text-sm text-danger">{error}</p>}
      {builder && <EventBuilder editing={builder.editing} onCancel={() => setBuilder(null)} onDone={() => { setBuilder(null); void load(); onChanged(); }} />}
      {events.length === 0 && <p className="text-sm text-secondary">Inga Event ännu.</p>}
      <ul className="space-y-2">
        {[...events].reverse().map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-surface p-3 text-sm">
            <div>
              <p className="font-semibold">{e.label} <span className="ml-1 rounded bg-raised px-1.5 py-0.5 text-[11px] font-medium">{STATUS_LABEL[e.status]}</span></p>
              <p className="text-xs text-secondary">{when(e.startsAt)} – {when(e.endsAt)}</p>
              <p className="text-xs text-secondary">{describe(e).join(" · ")}</p>
            </div>
            <div className="flex gap-2">
              {e.status === "upcoming" && (
                <>
                  <Button size="sm" variant="outline" onClick={() => setBuilder({ editing: e })}>Ändra</Button>
                  <Button size="sm" variant="outline" onClick={() => void run(() => deleteAdminEvent(e.id))}>Ta bort</Button>
                </>
              )}
              {e.status === "running" && <Button size="sm" variant="outline" onClick={() => void run(() => endAdminEvent(e.id))}>Avsluta nu</Button>}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
