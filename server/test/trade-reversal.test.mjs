import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startTestApp } from "./harness.mjs";

let t;
afterEach(() => t.close());

const give = (p, cardId, n) => { for (let i = 0; i < n; i++) t.db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(p.userId, cardId); };
const count = (p, cardId) => t.db.prepare("SELECT COUNT(*) n FROM owned_cards WHERE user_id = ? AND card_id = ?").get(p.userId, cardId).n;
const diamonds = (p) => t.db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(p.userId).diamonds;

async function acceptedTrade() {
  const alice = await t.registerPlayer();
  const bob = await t.registerPlayer();
  give(alice, "c1", 2); give(bob, "c2", 2);
  t.db.prepare("INSERT OR IGNORE INTO player_state (user_id) VALUES (?)").run(alice.userId);
  t.db.prepare("INSERT OR IGNORE INTO player_state (user_id) VALUES (?)").run(bob.userId);
  t.db.prepare("UPDATE player_state SET diamonds = 100 WHERE user_id IN (?, ?)").run(alice.userId, bob.userId);
  const res = await t.request("POST", "/api/trade", { cookie: alice.cookie, body: { receiverUserId: bob.userId, offeredCardIds: ["c1"], offeredDiamonds: 10, requestedCardIds: ["c2"], requestedDiamonds: 0 } });
  const id = res.body.id ?? t.db.prepare("SELECT id FROM trades").get().id;
  assert.equal((await t.request("POST", `/api/trade/${id}/accept`, { cookie: bob.cookie })).status, 200);
  return { alice, bob, id };
}

test("admin reverses an accepted Trade: Copies and Diamonds go back", async () => {
  t = await startTestApp();
  const { alice, bob, id } = await acceptedTrade();
  assert.equal(count(bob, "c1"), 1);
  const admin = await t.adminCookie();
  const res = await t.request("POST", `/api/admin/trades/${id}/reverse`, { cookie: admin });
  assert.equal(res.status, 200);
  assert.equal(count(alice, "c1"), 2); assert.equal(count(bob, "c1"), 0);
  assert.equal(count(bob, "c2"), 2); assert.equal(count(alice, "c2"), 0);
  assert.equal(diamonds(alice), 100); assert.equal(diamonds(bob), 100);
  assert.equal(t.db.prepare("SELECT status FROM trades WHERE id = ?").get(id).status, "reversed");
  // Cannot be reversed twice.
  assert.equal((await t.request("POST", `/api/admin/trades/${id}/reverse`, { cookie: admin })).status, 400);
});

test("reversal changes nothing when a side no longer holds what it received", async () => {
  t = await startTestApp();
  const { alice, bob, id } = await acceptedTrade();
  t.db.prepare("DELETE FROM owned_cards WHERE user_id = ? AND card_id = 'c1'").run(bob.userId);
  const admin = await t.adminCookie();
  const res = await t.request("POST", `/api/admin/trades/${id}/reverse`, { cookie: admin });
  assert.equal(res.status, 409);
  assert.equal(count(alice, "c2"), 1);
  assert.equal(diamonds(bob), 110);
  assert.equal(t.db.prepare("SELECT status FROM trades WHERE id = ?").get(id).status, "accepted");
});

test("reversal needs admin", async () => {
  t = await startTestApp();
  const { bob, id } = await acceptedTrade();
  assert.notEqual((await t.request("POST", `/api/admin/trades/${id}/reverse`, { cookie: bob.cookie })).status, 200);
});
