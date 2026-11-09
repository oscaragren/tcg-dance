# PROTOTYPE — Card pool simulator (throwaway, never merge)

Answers "Which Card pool and Upgrade model should the relaunch use?" (issue #12).

Production-derived data is deliberately **not** committed. To rebuild locally from a snapshot
(see `scripts/export-economy-snapshot.cjs`):

    python3 -I build-seed.py ~/tcg-dance-snapshots/snapshot-2026-11-09.json ../../data/game-content.json > seed.json
    node build-html.mjs          # -> card-pool-simulator.prototype.html (double-click to open)
    node run.mjs 90 3            # comparison table in the terminal

- `sim.mjs` — pure simulation module (models A–H)
- `page.template.html` — the clickable page shell
