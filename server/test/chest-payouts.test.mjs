import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { fakeClock, seededRandom, startTestApp } from "./harness.mjs";

const HOUR = 3600 * 1000;
let t, clock, player;
async function setup(random) {
  clock = fakeClock("2026-03-10T12:00:00+01:00");
  t = await startTestApp({ clock, random });
  player = await t.registerPlayer();
  t.db.prepare("UPDATE player_state SET diamonds = 1000 WHERE user_id = ?").run(player.userId);
}
afterEach(() => t.close());

const buy = (type) => t.request("POST", "/api/game/chests/buy", { cookie: player.cookie, body: { type } });
const collect = async (id) => {
  clock.advance(13 * HOUR);
  const res = await t.request("POST", `/api/game/chests/${id}/collect`, { cookie: player.cookie });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.diamondsAwarded;
};
const chestId = () => t.db.prepare("SELECT id FROM chests WHERE user_id = ?").get(player.userId).id;
const addOldChest = (type) =>
  // Inserted the way Chests were before payout tables existed: no version given.
  t.db.prepare("INSERT INTO chests (id, user_id, type, bought_at, ready_at) VALUES ('old', ?, ?, ?, ?)")
    .run(player.userId, type, new Date(clock.now()).toISOString(), new Date(clock.now()).toISOString());

// random 0 → the bottom of a range, 0.999 → the top. (The card rolls also read
// the random source, but only the first value is used for the payout.)
const LOW = 0, HIGH = 0.999;

test("a newly bought Chest records the current payout table", async () => {
  await setup(seededRandom([0]));
  await buy("bronze");
  assert.equal(t.db.prepare("SELECT payout_table FROM chests").get().payout_table, "v2");
});

for (const [type, min, max] of [["bronze", 10, 20], ["silver", 30, 45], ["gold", 50, 100]]) {
  test(`a new ${type} Chest pays ${min}–${max} Diamonds`, async () => {
    await setup(seededRandom([LOW]));
    await buy(type);
    assert.equal(await collect(chestId()), min);
    await t.close();
    await setup(seededRandom([HIGH]));
    await buy(type);
    assert.equal(await collect(chestId()), max);
  });
}

for (const [type, min, max] of [["bronze", 15, 30], ["silver", 50, 100], ["gold", 100, 250]]) {
  test(`a ${type} Chest from before the relaunch still pays ${min}–${max} Diamonds`, async () => {
    await setup(seededRandom([LOW]));
    addOldChest(type);
    assert.equal(t.db.prepare("SELECT payout_table FROM chests").get().payout_table, "v1");
    assert.equal(await collect("old"), min);
    await t.close();
    await setup(seededRandom([HIGH]));
    addOldChest(type);
    assert.equal(await collect("old"), max);
  });
}

test("the Chest list shows the current payout range, prices and waits unchanged", async () => {
  await setup(seededRandom([0]));
  const { body } = await t.request("GET", "/api/game/chests", { cookie: player.cookie });
  assert.deepEqual(body.types.map((c) => [c.id, c.price, c.waitHours, c.diamondMin, c.diamondMax]), [
    ["bronze", 10, 1, 10, 20], ["silver", 25, 5, 30, 45], ["gold", 50, 12, 50, 100],
  ]);
});
