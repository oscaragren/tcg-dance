import { createApp } from "../app.mjs";
import { openDatabase } from "../db.mjs";

/** A clock the test can set and advance. `at` is anything Date.parse accepts. */
export function fakeClock(at = "2026-03-10T12:00:00+01:00") {
  let t = Date.parse(at);
  return {
    now: () => t,
    set(next) { t = Date.parse(next); },
    advance(ms) { t += ms; },
  };
}

/** A deterministic random source returning the given values in order, then cycling. */
export function seededRandom(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/** A mailer that records instead of sending. */
export function fakeMailer() {
  const sent = [];
  return { sent, async sendPasswordResetEmail(to, url) { sent.push({ to, url }); } };
}

// A tiny catalog so tests don't depend on game-content.json (whose events and
// release dates change over time). Cards sort by id, which fixes draw order.
export const TEST_CATALOG = {
  cards: [
    { id: "c1", collectionId: "test", rarity: "common", name: "C1" },
    { id: "c2", collectionId: "test", rarity: "common", name: "C2" },
    { id: "r1", collectionId: "test", rarity: "rare", name: "R1" },
    { id: "l1", collectionId: "test", rarity: "legendary", name: "L1" },
  ],
  collections: [
    { id: "test", label: "Test", pack: { label: "Test pack", cardCount: 2, price: 100 } },
  ],
  dailyDiamonds: 150,
  copiesPerRarity: { common: 10, rare: 5, epic: 2, legendary: 1, special: 1 },
  events: [],
};

/**
 * Build the app against a fresh in-memory database and listen on a free port.
 * Returns helpers; call `close()` when done.
 */
export async function startTestApp({ clock = fakeClock(), random = seededRandom([0]), mailer = fakeMailer(), catalog = TEST_CATALOG } = {}) {
  const db = openDatabase(":memory:");
  const { app } = await createApp({
    db, clock, random, mailer, catalog,
    config: {
      jwtSecret: "test-secret",
      adminPassword: "admin-pw",
      corsOrigin: "http://localhost:5173",
      appUrl: "http://localhost:5173",
      isProduction: false,
      distPath: "/nonexistent",
    },
  });
  const server = await new Promise((resolve) => { const s = app.listen(0, () => resolve(s)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { body, cookie } = {}) {
    const res = await fetch(baseUrl + path, {
      method,
      headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
  }

  let n = 0;
  /** Register a player and return their auth cookie. */
  async function registerPlayer() {
    n += 1;
    const res = await request("POST", "/api/auth/register", {
      body: { username: `p${n}`, email: `p${n}@example.com`, password: "Passw0rdX", firstName: "Test", lastName: "Player" },
    });
    if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
    const cookie = res.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
    return { cookie, userId: res.body.user.id };
  }

  return {
    db, clock, mailer, request, registerPlayer,
    close: () => new Promise((resolve) => { server.close(() => { db.close(); resolve(); }); }),
  };
}
