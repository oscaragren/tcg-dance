# PROTOTYPE — throwaway. Builds an anonymised seed for the economy simulator
# from a production snapshot (scripts/export-economy-snapshot.cjs output).
# Usage: python3 -I build-seed.py <snapshot.json> <data/game-content.json> > seed.json
# Player ids are replaced by "Spelare N"; only per-Card copy counts are kept.
import json, sys, collections

snap = json.load(open(sys.argv[1]))
content = json.load(open(sys.argv[2]))

pool = {r["card_id"]: r for r in snap["pool"]}
ACTIVE_SINCE = "2026-11-03"  # claimed daily Diamonds in the last 7 days
active_ids = [p["user_id"] for p in snap["player_state"]
              if (p["last_daily_claim_date"] or "") >= ACTIVE_SINCE]

owned = collections.defaultdict(dict)
for row in snap["owned_cards"]:
    owned[row["user_id"]][row["card_id"]] = row["copies"]

collections_out = []
catalog = set()
for col in content["collections"]:
    cards = []
    for c in col["cards"]:
        p = pool.get(c["id"])
        if not p:
            continue
        catalog.add(c["id"])
        cards.append({"id": c["id"], "rarity": c["rarity"],
                      "total": p["total_copies"], "remaining": p["copies_remaining"]})
    collections_out.append({"id": col["id"], "label": col["label"], "cards": cards})

active = []
active_set = set(active_ids)
for i, uid in enumerate(sorted(active_ids, key=lambda u: -sum(owned[u].values()))):
    o = {k: v for k, v in owned[uid].items() if k in catalog}
    active.append({"name": f"Spelare {i+1}", "owned": o})

# Copies held by players who are not simulated (inactive) — static background.
rarity_of = {c["id"]: c["rarity"] for col in collections_out for c in col["cards"]}
col_of = {c["id"]: col["id"] for col in collections_out for c in col["cards"]}
inactive = collections.defaultdict(lambda: collections.defaultdict(int))
for uid, cards in owned.items():
    if uid in active_set:
        continue
    for cid, n in cards.items():
        if cid in rarity_of:
            inactive[col_of[cid]][rarity_of[cid]] += n

json.dump({
    "exportedAt": snap["exported_at"],
    "note": "Anonymised seed from the production snapshot. Active = Daily claim since " + ACTIVE_SINCE,
    "collections": collections_out,
    "players": active,
    "inactiveOwned": inactive,
}, sys.stdout, separators=(",", ":"))
