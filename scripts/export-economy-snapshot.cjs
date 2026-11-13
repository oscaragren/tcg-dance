// Read-only economy snapshot for the relaunch map (wayfinder ticket
// "Snapshot production pool and ownership data").
//
// Opens the SQLite database READ-ONLY and prints one JSON document to stdout.
// No emails, names, password hashes or tokens are exported; players appear
// only by their opaque user id.
//
// Run inside the production container, piping the script over stdin so
// nothing needs deploying:
//   railway ssh --service "Peppelinos Bar" -- sh -c 'cd /app && node -' \
//     < scripts/export-economy-snapshot.cjs > ~/tcg-dance-snapshots/snapshot.json
const path = require("node:path");
const Database = require(path.resolve("node_modules/better-sqlite3"));

const dbPath = process.env.DB_PATH ?? path.resolve("data/tcg.db");
const db = new Database(dbPath, { readonly: true, fileMustExist: true });
const all = (sql) => db.prepare(sql).all();
const tableExists = (name) =>
  db.prepare("SELECT COUNT(*) n FROM sqlite_master WHERE type='table' AND name=?").get(name).n > 0;
const maybe = (table, sql) => (tableExists(table) ? all(sql) : null);

const snapshot = {
  exported_at: new Date().toISOString(),
  db_path: dbPath,
  db_path_from_env: process.env.DB_PATH != null,

  users: all(`SELECT COUNT(*) n, MIN(created_at) first_created, MAX(created_at) last_created FROM users`)[0],

  pool_summary: all(`
    SELECT collection_id, rarity, COUNT(*) cards,
           SUM(total_copies) total_copies, SUM(copies_remaining) copies_remaining
    FROM card_pool GROUP BY collection_id, rarity ORDER BY collection_id, rarity`),
  pool: all(`SELECT card_id, collection_id, rarity, total_copies, copies_remaining
             FROM card_pool ORDER BY collection_id, rarity, card_id`),

  owned_by_rarity: all(`
    SELECT COALESCE(p.collection_id,'(not in pool)') collection_id,
           COALESCE(p.rarity,'(not in pool)') rarity, COUNT(*) copies,
           COUNT(DISTINCT o.user_id) holders, COUNT(DISTINCT o.card_id) distinct_cards
    FROM owned_cards o LEFT JOIN card_pool p ON p.card_id = o.card_id
    GROUP BY 1, 2 ORDER BY 1, 2`),
  owned_per_player_rarity: all(`
    SELECT o.user_id, COALESCE(p.collection_id,'(not in pool)') collection_id,
           COALESCE(p.rarity,'(not in pool)') rarity, COUNT(*) copies,
           COUNT(DISTINCT o.card_id) distinct_cards
    FROM owned_cards o LEFT JOIN card_pool p ON p.card_id = o.card_id
    GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`),
  owned_cards: all(`SELECT user_id, card_id, COUNT(*) copies FROM owned_cards
                    GROUP BY user_id, card_id ORDER BY user_id, card_id`),

  player_state: all(`
    SELECT s.user_id, s.diamonds, s.last_daily_claim_date, s.diamond_streak, u.created_at
    FROM player_state s JOIN users u ON u.id = s.user_id ORDER BY s.diamonds DESC`),
  diamonds_total: all(`SELECT SUM(diamonds) total, AVG(diamonds) avg, MAX(diamonds) max FROM player_state`)[0],

  upgrades_by_tier: maybe("upgrades", `
    SELECT collection_id, from_rarity, to_rarity, COUNT(*) n,
           SUM(json_array_length(consumed_card_ids)) copies_consumed,
           MIN(created_at) first, MAX(created_at) last
    FROM upgrades GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`),

  game_events_by_type: maybe("game_events", `
    SELECT type, collection_id, COUNT(*) n, SUM(quantity) quantity, SUM(diamonds) diamonds,
           COUNT(DISTINCT user_id) players, MIN(created_at) first, MAX(created_at) last
    FROM game_events GROUP BY 1, 2 ORDER BY 1, 2`),
  game_events_by_day: maybe("game_events", `
    SELECT substr(created_at,1,10) day, type, COUNT(*) n, SUM(quantity) quantity,
           SUM(diamonds) diamonds, COUNT(DISTINCT user_id) players
    FROM game_events GROUP BY 1, 2 ORDER BY 1, 2`),
  daily_active_by_day: maybe("game_events", `
    SELECT substr(created_at,1,10) day, COUNT(DISTINCT user_id) players
    FROM game_events GROUP BY 1 ORDER BY 1`),

  packs_opened: maybe("packs_opened", `
    SELECT collection_id, SUM(count) packs, COUNT(*) players FROM packs_opened GROUP BY 1`),
  trades_by_status: maybe("trades", `
    SELECT status, COUNT(*) n, SUM(offered_diamonds + requested_diamonds) diamonds
    FROM trades GROUP BY 1`),
  cards_for_trade: maybe("cards_for_trade", `SELECT COUNT(DISTINCT user_id) players, SUM(quantity) copies FROM cards_for_trade`)?.[0],
  chests_pending: maybe("chests", `SELECT type, COUNT(*) n FROM chests GROUP BY 1`),
  chest_type_slots: maybe("chest_type_slots", `SELECT type, COUNT(*) n FROM chest_type_slots GROUP BY 1`),
  achievement_claims: maybe("achievement_claims", `SELECT achievement_id, COUNT(*) n FROM achievement_claims GROUP BY 1 ORDER BY 1`),
};

process.stdout.write(JSON.stringify(snapshot, null, 2) + "\n");
