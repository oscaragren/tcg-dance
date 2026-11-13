import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * Open (and migrate) a game database. `filename` may be ":memory:". The
 * one-time import of the legacy data/*.json files only runs when
 * `legacyJsonDir` is given, so tests never pick up real player data.
 */
export function openDatabase(filename, { legacyJsonDir = null } = {}) {
const db = new Database(filename);
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
    -- Streak position on the 7-step track: +1 per Daily claim, back to 0 when
    -- the 7th step pays out. Missing a whole day resets it (read through
    -- liveStreak in app.mjs, so a lapsed one shows 0 before the next claim).
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

  -- Behåll: Cards the player keeps out of Trades. Available for Trade is derived
  -- from Copies owned and this flag (the old hand-marked cards_for_trade is gone).
  CREATE TABLE IF NOT EXISTS kept_cards (
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

  -- Chests bought in Handel and stored (unopened) in Samling until their timer
  -- runs out. The row is deleted the moment its contents are collected.
  CREATE TABLE IF NOT EXISTS chests (
    id        TEXT PRIMARY KEY,
    user_id   TEXT NOT NULL REFERENCES users(id),
    type      TEXT NOT NULL,
    bought_at TEXT NOT NULL,
    ready_at  TEXT NOT NULL,
    -- The payout table (game-content.json "chestPayouts") this Chest was bought
    -- under. Chests that predate payout tables are 'v1'.
    payout_table TEXT NOT NULL DEFAULT 'v1'
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

  -- How many packs each player has opened, per collection. Backs the
  -- the Weekly goal and admin stats; owned_cards cannot answer that because cards
  -- get traded, upgraded away and also arrive from chests.
  CREATE TABLE IF NOT EXISTS packs_opened (
    user_id       TEXT NOT NULL REFERENCES users(id),
    collection_id TEXT NOT NULL,
    count         INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, collection_id)
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

// Activity logs for the admin statistics page. Both only start filling from
// the release that added them — nothing before that was ever recorded.
db.exec(`
  -- One row per card upgrade (e.g. 20 commons -> 1 rare).
  CREATE TABLE IF NOT EXISTS upgrades (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id            TEXT NOT NULL REFERENCES users(id),
    collection_id      TEXT NOT NULL,
    from_rarity        TEXT NOT NULL,
    to_rarity          TEXT NOT NULL,
    consumed_card_ids  TEXT NOT NULL,  -- JSON array, one entry per copy used up
    result_card_id     TEXT NOT NULL,
    created_at         TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_upgrades_user ON upgrades(user_id);
  CREATE INDEX IF NOT EXISTS idx_upgrades_created ON upgrades(created_at);

  -- Lightweight timeline of economy actions: 'pack' (quantity packs bought for
  -- diamonds), 'daily' (diamonds claimed), 'streak_bonus' (Streak bonus), 'weekly_goal' (Weekly goal payout), 'achievement' (Achievement payout), 'chest_buy' (diamonds spent),
  -- 'chest_open' (diamonds won, quantity = cards won), 'admin_grant' (manual grant, with reason),
  -- 'trade_diamonds' (Diamonds moved between players in an accepted Trade; neither earned nor spent).
  CREATE TABLE IF NOT EXISTS game_events (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id        TEXT NOT NULL REFERENCES users(id),
    type           TEXT NOT NULL,
    collection_id  TEXT,
    quantity       INTEGER NOT NULL DEFAULT 0,
    diamonds       INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_game_events_created ON game_events(created_at);
  CREATE INDEX IF NOT EXISTS idx_game_events_user ON game_events(user_id);
`);

// Weekly goals. Progress is kept per player, per goal, per week (week_start is
// the Monday's Stockholm date). Rows from finished weeks are settled and
// removed lazily, see settleWeeklyGoals in app.mjs.
db.exec(`
  CREATE TABLE IF NOT EXISTS weekly_goal_progress (
    user_id    TEXT NOT NULL REFERENCES users(id),
    week_start TEXT NOT NULL,
    goal_id    TEXT NOT NULL,
    progress   INTEGER NOT NULL DEFAULT 0,
    claimed    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, week_start, goal_id)
  );
  CREATE INDEX IF NOT EXISTS idx_weekly_goal_week ON weekly_goal_progress(week_start);

  -- Every Card a player has ever held a Copy of. owned_cards forgets a Card the
  -- moment its last Copy is traded or upgraded away, so "new to your
  -- Collection" (Weekly goals) needs this, or trading a Card back and forth
  -- would count as new every time.
  CREATE TABLE IF NOT EXISTS ever_owned_cards (
    user_id TEXT NOT NULL REFERENCES users(id),
    card_id TEXT NOT NULL,
    PRIMARY KEY (user_id, card_id)
  );
  INSERT OR IGNORE INTO ever_owned_cards (user_id, card_id) SELECT DISTINCT user_id, card_id FROM owned_cards;
`);

// Starter checklist ("Kom igång"). One row per player: free_pack says whether
// they are entitled to the free Pack (1 until claimed, 0 after or if they had
// already opened Packs), viewed_collection records that the Samling screen was
// opened. starter_claims holds the checklist steps whose reward was taken.
db.exec(`
  CREATE TABLE IF NOT EXISTS starter_state (
    user_id           TEXT PRIMARY KEY REFERENCES users(id),
    free_pack         INTEGER NOT NULL DEFAULT 0,
    viewed_collection INTEGER NOT NULL DEFAULT 0,
    checklist         INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS starter_claims (
    user_id TEXT NOT NULL REFERENCES users(id),
    step    TEXT NOT NULL,
    PRIMARY KEY (user_id, step)
  );
`);

// Comeback ("Välkommen tillbaka"). A row exists once a player has been seen
// returning after a long absence. away_since is the date of their last Daily
// claim before leaving. gift_pending / summary_pending are cleared when the gift
// is claimed / the summary is dismissed; last_gift_at spaces gifts 30 days apart.
db.exec(`
  CREATE TABLE IF NOT EXISTS comeback_state (
    user_id         TEXT PRIMARY KEY REFERENCES users(id),
    away_since      TEXT NOT NULL,
    gift_pending    INTEGER NOT NULL DEFAULT 0,
    summary_pending INTEGER NOT NULL DEFAULT 0,
    last_gift_at    TEXT
  );
`);

// Top-ups: Copies the admin has added to a Collection's Card pool. bonus_copies
// is the part of total_copies that came from Top-ups, so the startup pool sync
// (which resets total_copies to the configured amount) does not undo them.
// topups holds at most one row per Collection: a pending Top-up, or a dismissed
// one that stays quiet until the Rare+ share has risen above the trigger again.
db.exec(`
  CREATE TABLE IF NOT EXISTS topups (
    collection_id TEXT PRIMARY KEY,
    status        TEXT NOT NULL CHECK (status IN ('pending', 'dismissed')),
    rare          INTEGER NOT NULL DEFAULT 0,
    epic          INTEGER NOT NULL DEFAULT 0,
    created_at    TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS topup_log (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    collection_id TEXT NOT NULL,
    rare          INTEGER NOT NULL,
    epic          INTEGER NOT NULL,
    source        TEXT NOT NULL CHECK (source IN ('approved', 'manual', 'event')),
    created_at    TEXT NOT NULL
  );
`);
// Events are built in the admin panel. Times are UTC ISO strings. An Event that
// is ended early has its ends_at moved to that moment. events_seeded remembers
// which content-file Events were already carried over, so deleting one sticks.
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id                  TEXT PRIMARY KEY,
    label               TEXT NOT NULL,
    starts_at           TEXT NOT NULL,
    ends_at             TEXT NOT NULL,
    daily_diamonds      INTEGER,
    chest_wait_hours    TEXT,
    chest_multiplier    REAL,
    gift_type           TEXT CHECK (gift_type IN ('diamonds', 'chest')),
    gift_diamonds       INTEGER,
    gift_chest_type     TEXT,
    topup_collection_id TEXT,
    topup_fired_at      TEXT,
    ended_early_at      TEXT,
    created_at          TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS events_seeded (id TEXT PRIMARY KEY);
  CREATE TABLE IF NOT EXISTS event_gift_claims (
    event_id   TEXT NOT NULL,
    user_id    TEXT NOT NULL,
    claimed_at TEXT NOT NULL,
    PRIMARY KEY (event_id, user_id)
  );
`);
db.exec("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
// Written once by the relaunch migration (server/relaunch-migration.mjs), one row
// per player it paid or whose Trades it cancelled. Read by "Det här är nytt".
db.exec(`
  CREATE TABLE IF NOT EXISTS relaunch_migration_players (
    user_id            TEXT PRIMARY KEY REFERENCES users(id),
    achievement_payout INTEGER NOT NULL DEFAULT 0,
    cancelled_trades   INTEGER NOT NULL DEFAULT 0,
    migrated_at        TEXT NOT NULL
  );
`);
// Players who have dismissed the one-time "Det här är nytt" sheet (#48).
db.exec(`
  CREATE TABLE IF NOT EXISTS whats_new_seen (
    user_id TEXT PRIMARY KEY REFERENCES users(id),
    seen_at TEXT NOT NULL
  );
`);
if (db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('card_pool') WHERE name='bonus_copies'").get().n === 0) {
  db.exec("ALTER TABLE card_pool ADD COLUMN bonus_copies INTEGER NOT NULL DEFAULT 0");
}

// Add collection_id column if upgrading from an older schema
const hasCollectionId =
  db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('card_pool') WHERE name='collection_id'").get().n > 0;
if (!hasCollectionId) {
  db.exec("ALTER TABLE card_pool ADD COLUMN collection_id TEXT NOT NULL DEFAULT 'sm2026'");
  console.log("Migrated card_pool: added collection_id column.");
}

// Add payout_table column to chests if upgrading from an older schema
const hasPayoutTable =
  db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('chests') WHERE name='payout_table'").get().n > 0;
if (!hasPayoutTable) {
  db.exec("ALTER TABLE chests ADD COLUMN payout_table TEXT NOT NULL DEFAULT 'v1'");
  console.log("Migrated chests: added payout_table column.");
}

// Manual "vill byta" marks were replaced by derived availability + Behåll.
db.exec("DROP TABLE IF EXISTS cards_for_trade");

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

// Temporary bans (admin-set). banned_until is an ISO timestamp; a ban is
// active while it lies in the future, so an expired ban needs no cleanup job.
for (const column of ["banned_until", "ban_reason"]) {
  const exists =
    db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('users') WHERE name = ?").get(column).n > 0;
  if (!exists) {
    db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
    console.log(`Migrated users: added ${column} column.`);
  }
}

// game_events.reason: the admin's required note on a manual Diamond grant.
if (db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('game_events') WHERE name = 'reason'").get().n === 0) {
  db.exec("ALTER TABLE game_events ADD COLUMN reason TEXT");
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

// Dismissible Hem banner on an Announcement: optional text, dismissed per player.
{
  const exists =
    db.prepare("SELECT COUNT(*) as n FROM pragma_table_info('announcements') WHERE name = 'banner_text'").get().n > 0;
  if (!exists) {
    db.exec("ALTER TABLE announcements ADD COLUMN banner_text TEXT NOT NULL DEFAULT ''");
    console.log("Migrated announcements: added banner_text column.");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS announcement_banner_dismissals (
      user_id         TEXT NOT NULL REFERENCES users(id),
      announcement_id TEXT NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, announcement_id)
    );
  `);
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
if (isEmpty && legacyJsonDir) {
  const usersPath = path.join(legacyJsonDir, "users.json");
  const statePath = path.join(legacyJsonDir, "player-state.json");

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

return db;
}
