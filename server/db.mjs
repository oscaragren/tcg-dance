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

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id           TEXT PRIMARY KEY,
    username     TEXT NOT NULL,
    email        TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at   TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS player_state (
    user_id              TEXT PRIMARY KEY REFERENCES users(id),
    diamonds             INTEGER NOT NULL DEFAULT 0,
    last_daily_claim_date TEXT,
    last_opened_cards    TEXT NOT NULL DEFAULT '[]'
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
    created_at         TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_trades_sender   ON trades(sender_user_id);
  CREATE INDEX IF NOT EXISTS idx_trades_receiver ON trades(receiver_user_id);

  CREATE TABLE IF NOT EXISTS cards_for_trade (
    user_id TEXT NOT NULL REFERENCES users(id),
    card_id TEXT NOT NULL,
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
`);

// Add collection_id column if upgrading from an older schema
const hasCollectionId =
  db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('card_pool') WHERE name='collection_id'").get().n > 0;
if (!hasCollectionId) {
  db.exec("ALTER TABLE card_pool ADD COLUMN collection_id TEXT NOT NULL DEFAULT 'sm2026'");
  console.log("Migrated card_pool: added collection_id column.");
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
