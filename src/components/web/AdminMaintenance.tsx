import { useEffect, useState } from "react";
import { Button } from "../shared/ui/button";
import { fetchAdminMaintenance, saveAdminMaintenance, type MaintenanceStatus } from "../../utils/adminApi";

const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Admin switch that closes the game for players ("Vi uppdaterar"). Admin routes keep working. */
export function AdminMaintenance() {
  const [status, setStatus] = useState<MaintenanceStatus | null>(null);
  const [reopensAt, setReopensAt] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function apply(s: MaintenanceStatus) {
    setStatus(s);
    setReopensAt(toLocalInput(s.reopensAt));
    setNote(s.note ?? "");
  }

  useEffect(() => {
    fetchAdminMaintenance().then(apply).catch((e) => setError(e instanceof Error ? e.message : "Kunde inte hämta status."));
  }, []);

  async function save(on: boolean) {
    setSaving(true);
    setError(null);
    try {
      apply(await saveAdminMaintenance({ on, reopensAt: reopensAt ? new Date(reopensAt).toISOString() : undefined, note: note || undefined }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Kunde inte spara.");
    } finally {
      setSaving(false);
    }
  }

  if (!status) return error ? <p className="text-sm text-danger">{error}</p> : null;

  return (
    <div className="rounded-xl bg-raised p-4 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-semibold">Underhållsläge</h3>
        <span className={`text-xs font-medium ${status.on ? "text-danger" : "text-muted-foreground"}`}>
          {status.on ? "PÅ – spelet är stängt för spelare" : "Av"}
        </span>
      </div>
      <label className="block text-sm">
        Väntad återöppning
        <input type="datetime-local" value={reopensAt} onChange={(e) => setReopensAt(e.target.value)} className="mt-1 block w-full rounded-lg bg-surface px-3 py-2" />
      </label>
      <label className="block text-sm">
        Kort notis till spelarna
        <input type="text" maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Vi flyttar spelet till ny server." className="mt-1 block w-full rounded-lg bg-surface px-3 py-2" />
      </label>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex gap-2">
        {status.on ? (
          <>
            <Button disabled={saving} onClick={() => void save(true)}>Uppdatera</Button>
            <Button disabled={saving} variant="outline" onClick={() => void save(false)}>Öppna spelet</Button>
          </>
        ) : (
          <Button disabled={saving} onClick={() => void save(true)}>Stäng spelet</Button>
        )}
      </div>
    </div>
  );
}
