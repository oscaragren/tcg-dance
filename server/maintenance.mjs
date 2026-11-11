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

export function setMaintenance(db, { on, reopensAt = null, note = null }) {
  if (!on) {
    db.prepare("DELETE FROM settings WHERE key = ?").run(KEY);
  } else {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(KEY, JSON.stringify({ reopensAt, note }));
  }
  return getMaintenance(db);
}
