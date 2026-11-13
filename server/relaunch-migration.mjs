// The relaunch migration (#47): moves every existing player to the new rules
// during the relaunch close. One transaction, in this order:
//   1. maintenance on (and left on: the admin reopens by hand)
//   2. cancel all pending Trades, counting them per player
//   3. pay Achievements: earned-but-unclaimed ones being removed, and the full
//      difference where the new table pays more than was claimed (no clawback)
//   4. set each Streak position to the current streak count (0-6; a lapsed one is 0)
//   5. tag existing Chests with the old payout table
//   6. fire the first Top-ups for every Collection under the trigger share
// Old Trade marks (cards_for_trade) are dropped when the database is opened;
// availability is derived from Copies and Behåll. Copies, Diamond balances (bar
// the payouts) and Chest slots are never touched.
//
// Idempotent: a `settings` row marks the run, and a rerun does nothing at all.
//
// Per player the run records, in relaunch_migration_players (the source for
// #48's "Det här är nytt" lines):
//   achievement_payout - total Diamonds paid in step 3
//   cancelled_trades   - Trades cancelled in step 2 (as sender or receiver)

import { setMaintenance } from "./maintenance.mjs";
import { buildLegacyAchievementDefinitions, legacyAchievementEarned } from "./legacy-achievements.mjs";

const MARKER = "relaunch_migration";
export const LEGACY_CHEST_TABLE = "v1";
const STREAK_LAST_STEP = 6;

export function runRelaunchMigration(db, deps, { reopensAt = null, note = null, autoReopen = false } = {}) {
  const { allCards, collections, achievementById, nowIso, todayIso, collectionTopUp, applyTopUp } = deps;

  if (db.prepare("SELECT 1 FROM settings WHERE key = ?").get(MARKER)) {
    return { alreadyRun: true, ...summarise(db) };
  }

  const yesterdayIso = (() => {
    const d = new Date(`${todayIso}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  })();

  const perPlayer = new Map(); // userId -> { payout, cancelled }
  const slot = (userId) => {
    if (!perPlayer.has(userId)) perPlayer.set(userId, { payout: 0, cancelled: 0 });
    return perPlayer.get(userId);
  };

  const run = db.transaction(() => {
    // 1. maintenance on
    setMaintenance(db, { on: true, reopensAt, note, autoReopen });

    // 2. cancel pending Trades (expired-but-unsettled ones too: nothing may stay pending)
    const pending = db.prepare("SELECT id, sender_user_id, receiver_user_id FROM trades WHERE status = 'pending'").all();
    for (const trade of pending) {
      slot(trade.sender_user_id).cancelled += 1;
      slot(trade.receiver_user_id).cancelled += 1;
    }
    db.prepare("UPDATE trades SET status = 'cancelled' WHERE status = 'pending'").run();

    // 3. Achievement payouts
    const legacy = buildLegacyAchievementDefinitions(allCards, collections);
    const claims = groupBy(db.prepare("SELECT user_id, achievement_id FROM achievement_claims").all(), (r) => r.achievement_id, () => new Set(), (set, v) => set.add(v));
    const owned = groupBy(db.prepare("SELECT DISTINCT user_id, card_id FROM owned_cards").all(), (r) => r.card_id, () => new Set(), (set, v) => set.add(v));
    const packs = new Map(); // userId -> { collectionId: count }
    for (const r of db.prepare("SELECT user_id, collection_id, count FROM packs_opened").all()) {
      if (!packs.has(r.user_id)) packs.set(r.user_id, {});
      packs.get(r.user_id)[r.collection_id] = r.count;
    }
    const logPayout = db.prepare(
      "INSERT INTO game_events (user_id, type, collection_id, quantity, diamonds, created_at) VALUES (?, 'achievement', ?, 0, ?, ?)",
    );
    const hasState = db.prepare("SELECT 1 FROM player_state WHERE user_id = ?");
    const addDiamonds = db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?");
    for (const { id: userId } of db.prepare("SELECT id FROM users").all()) {
      const hasPlayerState = !!hasState.get(userId);
      const claimed = claims.get(userId) ?? new Set();
      const ownedSet = owned.get(userId) ?? new Set();
      for (const old of legacy) {
        const next = achievementById.get(old.id);
        let pay = 0;
        if (claimed.has(old.id)) {
          if (next && next.reward > old.reward) pay = next.reward - old.reward;
        } else if (!next && legacyAchievementEarned(old, ownedSet, allCards, packs.get(userId))) {
          pay = old.reward;
        }
        if (pay <= 0) continue;
        if (!hasPlayerState) continue;
        addDiamonds.run(pay, userId);
        logPayout.run(userId, old.collectionId ?? null, pay, nowIso);
        slot(userId).payout += pay;
      }
    }

    // 4. Streak position: a Streak that was still alive keeps its count; one that
    // had already lapsed under the old reset rule starts again at 0.
    db.prepare(
      `UPDATE player_state SET diamond_streak =
         CASE WHEN last_daily_claim_date IN (?, ?) THEN MAX(0, MIN(?, diamond_streak)) ELSE 0 END`,
    ).run(todayIso, yesterdayIso, STREAK_LAST_STEP);

    // 5. existing Chests keep paying from the old table
    db.prepare("UPDATE chests SET payout_table = ?").run(LEGACY_CHEST_TABLE);

    // 6. first Top-ups
    const topUps = [];
    for (const collection of collections) {
      const amounts = collectionTopUp(collection.id);
      if (!amounts) continue;
      applyTopUp(collection.id, amounts, "manual");
      topUps.push({ collectionId: collection.id, ...amounts });
    }

    // Record per player, then mark the run done.
    const insert = db.prepare(
      "INSERT INTO relaunch_migration_players (user_id, achievement_payout, cancelled_trades, migrated_at) VALUES (?, ?, ?, ?)",
    );
    for (const [userId, v] of perPlayer) {
      if (v.payout > 0 || v.cancelled > 0) insert.run(userId, v.payout, v.cancelled, nowIso);
    }
    db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run(MARKER, JSON.stringify({ at: nowIso, topUps, cancelledTrades: pending.length }));
  });
  run();

  return { alreadyRun: false, ...summarise(db) };
}

// Groups rows by user_id into a Map of accumulators.
function groupBy(rows, valueOf, make, add) {
  const map = new Map();
  for (const r of rows) {
    if (!map.has(r.user_id)) map.set(r.user_id, make());
    add(map.get(r.user_id), valueOf(r));
  }
  return map;
}

/** The recorded run ({ at, topUps, cancelledTrades }), or null if the migration has not run. */
export function readRelaunchMigrationMarker(db) {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(MARKER);
  return row ? JSON.parse(row.value) : null;
}

function summarise(db) {
  const row = db.prepare(
    "SELECT COUNT(*) AS players, COALESCE(SUM(achievement_payout), 0) AS payout, COALESCE(SUM(cancelled_trades), 0) AS cancelled FROM relaunch_migration_players",
  ).get();
  const recorded = readRelaunchMigrationMarker(db) ?? { topUps: [], cancelledTrades: 0 };
  return {
    players: db.prepare("SELECT * FROM relaunch_migration_players ORDER BY user_id").all(),
    playersAffected: row.players,
    achievementPayoutTotal: row.payout,
    cancelledTrades: recorded.cancelledTrades, // distinct Trades; per player each counts for both parties
    topUps: recorded.topUps,
  };
}
