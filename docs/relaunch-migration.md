# Relaunch migration

One-off script that moves every player to the new rules (issue #47). Code: `server/relaunch-migration.mjs`, runner: `scripts/relaunch-migration.mjs`.

Order: maintenance on, cancel pending Trades (count per player), pay Achievements, set Streak positions, tag existing Chests with the old payout table (`v1`), fire the first Top-ups for every Collection under 3% Rare+. Copies, Diamond balances (bar payouts) and Chest slots are untouched. Maintenance is left on; reopen by hand in the admin panel after checking.

Streak rule (step 4): every Streak position is carried over as the player's current streak count clamped to 0-6. A Streak that had already lapsed under the old reset rule (last Daily claim neither today nor yesterday) counts as 0, because under the old rules it would have reset on the next claim; one still alive keeps its position unchanged.

Achievement payouts use the old table frozen in `server/legacy-achievements.mjs`: earned-but-unclaimed Achievements that no longer exist are paid at their old reward; claimed Achievements that still exist are topped up by the difference when the new reward is higher. Nothing is clawed back.

Old Trade marks (`cards_for_trade`) are dropped by `openDatabase` on deploy; availability is derived from Copies and Behåll.

## Recorded for the "Det här är nytt" lines (#48)

Table `relaunch_migration_players` (one row per player paid or with cancelled Trades): `achievement_payout` (Diamonds), `cancelled_trades` (a Trade counts for both sender and receiver), `migrated_at`. Payouts are also in `game_events` as type `achievement`. The run itself is marked by the `settings` key `relaunch_migration`; rerunning only reprints the report.

## Dry run against a copy of production

1. Get a copy of the production database (the Volume file, `tcg.db`) to a local path, e.g. `data/prod-copy.db`. Never point a rehearsal at the live file.
2. `node scripts/relaunch-migration.mjs --db data/prod-copy.db`
3. Compare the report with expectations: about 49,500 Diamonds in Achievement payouts (all SM 2026), about 800 Copies Top-up for SM 2026 and about 3,250 for SM 21-25.

## Run live on Railway

Live game: Railway project `ravishing-joy`, service `tcg-dance` (it has the Volume). Not the empty "Peppelinos Bar" service.

1. Friday ~22:00, after the new version is deployed: `railway link` to project `ravishing-joy`, service `tcg-dance`.
2. Open a shell in the running service: `railway ssh`.
3. In it: `node scripts/relaunch-migration.mjs --reopens-at <ISO time> --note "Vi uppdaterar"` (`DB_PATH` is already set by the service; add `--db` to override).
4. Check the report and the game through the admin panel, then switch maintenance off by hand.
