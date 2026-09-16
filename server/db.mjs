import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");
const dbPath = process.env.DB_PATH ?? path.join(workspaceRoot, "data", "tcg.db");

const db = new Database(dbPath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Captured before the CREATE TABLE IF NOT EXISTS below runs, so we can tell a
// brand-new database (seed the starter announcements) from one that's simply
// never had this table before this deploy.
const announcementsTableExisted =
  db.prepare("SELECT COUNT(*) as n FROM sqlite_master WHERE type = 'table' AND name = 'announcements'").get().n > 0;

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT NOT NULL,
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at   TEXT NOT NULL,
    first_name   TEXT,
    last_name    TEXT
  );

  CREATE TABLE IF NOT EXISTS player_state (
    user_id              TEXT PRIMARY KEY REFERENCES users(id),
    diamonds             INTEGER NOT NULL DEFAULT 0,
    last_daily_claim_date TEXT,
    last_opened_cards    TEXT NOT NULL DEFAULT '[]',
    -- Consecutive days the daily diamonds have been claimed with no gap.
    -- Resets to 1 (today counts) whenever a day is missed, and back to 0 the
    -- moment it hits the 7-day bonus, so the next claim starts a fresh streak.
    diamond_streak       INTEGER NOT NULL DEFAULT 0,
    -- created_at of the newest announcement this player has opened the
    -- dropdown after. NULL means never opened it (or never any yet).
    last_seen_announcement_at TEXT
  );

  CREATE TABLE IF NOT EXISTS owned_cards (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id  TEXT NOT NULL REFERENCES users(id),
    card_id  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_owned_cards_user_id ON owned_cards(user_id);

  CREATE TABLE IF NOT EXISTS trades (
    id                 TEXT PRIMARY KEY,
    sender_user_id     TEXT NOT NULL REFERENCES users(id),
    receiver_user_id   TEXT NOT NULL REFERENCES users(id),
    offered_card_ids   TEXT NOT NULL DEFAULT '[]',
    offered_diamonds   INTEGER NOT NULL DEFAULT 0,
    requested_card_ids TEXT NOT NULL DEFAULT '[]',
    requested_diamonds INTEGER NOT NULL DEFAULT 0,
    status             TEXT NOT NULL DEFAULT 'pending',
    created_at         TEXT NOT NULL,
    counter_of_trade_id TEXT REFERENCES trades(id)
  );

  CREATE INDEX IF NOT EXISTS idx_trades_sender   ON trades(sender_user_id);
  CREATE INDEX IF NOT EXISTS idx_trades_receiver ON trades(receiver_user_id);

  CREATE TABLE IF NOT EXISTS cards_for_trade (
    user_id TEXT NOT NULL REFERENCES users(id),
    card_id TEXT NOT NULL,
    quantity INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (user_id, card_id)
  );

  CREATE TABLE IF NOT EXISTS card_pool (
    card_id          TEXT PRIMARY KEY,
    collection_id    TEXT NOT NULL DEFAULT 'sm2026',
    rarity           TEXT NOT NULL,
    total_copies     INTEGER NOT NULL,
    copies_remaining INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token      TEXT PRIMARY KEY,
    user_id    TEXT NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS achievement_claims (
    user_id        TEXT NOT NULL REFERENCES users(id),
    achievement_id TEXT NOT NULL,
    claimed_at     TEXT NOT NULL,
    PRIMARY KEY (user_id, achievement_id)
  );

  -- Chests bought in Handel and stored (unopened) in Samling until their timer
  -- runs out. The row is deleted the moment its contents are collected.
  CREATE TABLE IF NOT EXISTS chests (
    id        TEXT PRIMARY KEY,
    user_id   TEXT NOT NULL REFERENCES users(id),
    type      TEXT NOT NULL,
    bought_at TEXT NOT NULL,
    ready_at  TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_chests_user ON chests(user_id);

  -- Legacy: a single "how many chests may I hold" counter, replaced by the
  -- per-type slots below. Kept (unused) so that upgrading a database never
  -- silently destroys a purchase; safe to drop by hand once verified empty.
  CREATE TABLE IF NOT EXISTS chest_slots (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    slots   INTEGER NOT NULL DEFAULT 1
  );

  -- Chest storage. Everyone has one free universal slot that takes any chest;
  -- on top of that a player can buy one dedicated slot per chest type, which
  -- only ever holds that type. One row per slot bought — no row means not
  -- bought, so the free slot needs no row at all.
  CREATE TABLE IF NOT EXISTS chest_type_slots (
    user_id     TEXT NOT NULL REFERENCES users(id),
    type        TEXT NOT NULL,
    bought_at   TEXT NOT NULL,
    PRIMARY KEY (user_id, type)
  );

  -- News shown from the megaphone dropdown in the header, newest first.
  -- Managed from the admin panel: publish (insert) and remove (delete).
  CREATE TABLE IF NOT EXISTS announcements (
    id         TEXT PRIMARY KEY,
    title      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// Add collection_id column if upgrading from an older schema
const hasCollectionId =
  db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('card_pool') WHERE name='collection_id'").get().n > 0;
if (!hasCollectionId) {
  db.exec("ALTER TABLE card_pool ADD COLUMN collection_id TEXT NOT NULL DEFAULT 'sm2026'");
  console.log("Migrated card_pool: added collection_id column.");
}

// Add quantity column to cards_for_trade if upgrading from an older schema
const hasTradeQuantity =
  db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('cards_for_trade') WHERE name='quantity'").get().n > 0;
if (!hasTradeQuantity) {
  db.exec("ALTER TABLE cards_for_trade ADD COLUMN quantity INTEGER NOT NULL DEFAULT 1");
  console.log("Migrated cards_for_trade: added quantity column.");
}

// Add counter_of_trade_id if upgrading from a schema without counter-offers.
// Nullable by nature: only counters have a parent. Kept even though the UI shows
// counters as standalone offers, because it is the only record of which offer a
// counter replaced — the admin trade report and any later dispute need that.
{
  const exists =
    db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('trades') WHERE name = 'counter_of_trade_id'").get().n > 0;
  if (!exists) {
    db.exec("ALTER TABLE trades ADD COLUMN counter_of_trade_id TEXT REFERENCES trades(id)");
    console.log("Migrated trades: added counter_of_trade_id column.");
  }
}

// Add first_name / last_name columns if upgrading from an older schema.
// Deliberately nullable even though names are mandatory: SQLite cannot add a
// NOT NULL column to a table that already has rows without supplying a default,
// and any default would let every pre-existing account satisfy the constraint
// with a blank name. The requirement is enforced in the application instead —
// register validation rejects missing names, and requireCompleteProfile blocks
// every gameplay route until an existing user has filled theirs in.
for (const column of ["first_name", "last_name"]) {
  const exists =
    db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('users') WHERE name = ?").get(column).n > 0;
  if (!exists) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
    console.log(`Migrated users: added ${column} column.`);
  }
}

// Add diamond_streak column if upgrading from an older schema
{
  const exists =
    db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('player_state') WHERE name = 'diamond_streak'").get().n > 0;
  if (!exists) {
    db.exec("ALTER TABLE player_state ADD COLUMN diamond_streak INTEGER NOT NULL DEFAULT 0");
    console.log("Migrated player_state: added diamond_streak column.");
  }
}

// Add last_seen_announcement_at column if upgrading from an older schema
{
  const exists =
    db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('player_state') WHERE name = 'last_seen_announcement_at'").get().n > 0;
  if (!exists) {
    db.exec("ALTER TABLE player_state ADD COLUMN last_seen_announcement_at TEXT");
    console.log("Migrated player_state: added last_seen_announcement_at column.");
  }
}

// Seed the starter announcements once, the first time this database ever
// gets the announcements table (fresh install, or upgrading from a version
// before it existed). Never reruns after that, so deleting them from the
// admin panel is permanent and won't come back on a restart.
if (!announcementsTableExisted) {
  const stmtAnnouncement = db.prepare(
    "INSERT INTO announcements (id, title, body, created_at) VALUES (?, ?, ?, ?)",
  );
  db.transaction(() => {
    stmtAnnouncement.run(
      crypto.randomUUID(),
      "Diamant-streak",
      "Vi har lagt till en streak! Hämta dina diamanter 7 dagar i rad och få 500 diamanter " +
        "(istället för 150) på den 7:e dagen. Glatt samlande!",
      "2026-09-16T00:00:00.000Z",
    );
    stmtAnnouncement.run(
      crypto.randomUUID(),
      "GP-dagen 26 september",
      "På tävlingsdagen den 26:e september när Säävbuggen GP går av stapeln får alla kortsamlare " +
        "800 diamanter istället för 150 när man hämtar de dagliga diamanterna. Guldkistornas väntetid " +
        "kortas dessutom ner från 12 till 3 timmar den dagen. Missa inte!",
      "2026-09-10T00:00:00.000Z",
    );
  })();
  console.log("Seeded starter announcements.");
}

// One-time migration from JSON files
const isEmpty = db.prepare("SELECT COUNT(*) as n FROM users").get().n === 0;
if (isEmpty) {
  const usersPath = path.join(workspaceRoot, "data", "users.json");
  const statePath = path.join(workspaceRoot, "data", "player-state.json");

  const stmtUser = db.prepare(
    "INSERT OR IGNORE INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  );
  const stmtState = db.prepare(
    "INSERT OR IGNORE INTO player_state (user_id, diamonds, last_daily_claim_date, last_opened_cards) VALUES (?, ?, ?, ?)",
  );
  const stmtCard = db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)");

  db.transaction(() => {
    if (fs.existsSync(usersPath)) {
      const users = JSON.parse(fs.readFileSync(usersPath, "utf8"));
      for (const u of Array.isArray(users) ? users : []) {
        stmtUser.run(u.id, u.username, u.email, u.passwordHash, u.createdAt);
      }
    }

    if (fs.existsSync(statePath)) {
      const allState = JSON.parse(fs.readFileSync(statePath, "utf8"));
      const knownUser = db.prepare("SELECT 1 FROM users WHERE id = ?");
      for (const [userId, s] of Object.entries(allState)) {
        if (!knownUser.get(userId)) continue; // skip orphaned state
        stmtState.run(
          userId,
          s.diamonds ?? 0,
          s.lastDailyClaimDate ?? null,
          JSON.stringify(s.lastOpenedCards ?? []),
        );
        for (const cardId of s.ownedCardIds ?? []) {
          stmtCard.run(userId, cardId);
        }
      }
    }
  })();

  console.log("Migrated existing data from JSON files to SQLite.");
}

export default db;
