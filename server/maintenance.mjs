// Maintenance mode: an admin switch that closes the game for players.
// Stored as one JSON row in `settings`; no row means the game is open. The
// migration script (#47) switches it on through setMaintenance().

const KEY = "maintenance";

export function getMaintenance(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY);
  if (!row) return { on: false, reopensAt: null, note: null };
  const v = JSON.parse(row.value);
  return { on: true, reopensAt: v.reopensAt ?? null, note: v.note ?? null };
}

// autoReopen: the window lifts itself once reopensAt has passed (see
// liftMaintenanceIfDue). Without it, reopensAt is only a displayed estimate and
// the admin reopens by hand.
export function setMaintenance(db, { on, reopensAt = null, note = null, autoReopen = false }) {
  if (!on) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(KEY);
  } else {
    const value = autoReopen ? { reopensAt, note, autoReopen: true } : { reopensAt, note };
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(KEY, JSON.stringify(value));
  }
  return getMaintenance(db);
}

/** Switch maintenance off if it was set with autoReopen and reopensAt has passed. */
export function liftMaintenanceIfDue(db, nowMs) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(KEY);
  if (!row) return false;
  const v = JSON.parse(row.value);
  if (!v.autoReopen) return false;
  const at = Date.parse(v.reopensAt);
  if (Number.isNaN(at) || nowMs < at) return false;
  db.prepare("DELETE FROM settings WHERE key = ?").run(KEY);
  return true;
}
