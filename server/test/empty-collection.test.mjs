import { test } from "node:test";
import assert from "node:assert/strict";
import { loadGameCatalog } from "../gameCatalog.mjs";

// A Collection announced in game-content.json before its Cards exist (SM 2016)
// must not exist for the game: no pool, no Pack, not listed.
test("a Collection with no Cards yet is left out of the catalog", async () => {
  const catalog = await loadGameCatalog();
  assert.ok(catalog.collections.length > 0);
  for (const c of catalog.collections) {
    assert.ok(catalog.cards.some((card) => card.collectionId === c.id), `${c.id} has no Cards but is listed`);
  }
  assert.ok(!catalog.collections.some((c) => c.id === "sm2016"));
});
