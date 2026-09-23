import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import db from "./db.mjs";
import { loadGameCatalog } from "./gameCatalog.mjs";
import { sendPasswordResetEmail } from "./mailer.mjs";
import { buildAchievementDefinitions, computeAchievementProgress } from "./achievements.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT ?? process.env.AUTH_API_PORT ?? 4000);
const IS_PRODUCTION = process.env.NODE_ENV === "production";

if (IS_PRODUCTION && !process.env.AUTH_JWT_SECRET) {
  throw new Error("AUTH_JWT_SECRET must be set in production.");
}
const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? "dev-only-secret-change-me";
const TOKEN_COOKIE_NAME = "tcg_auth_token";
const tokenMaxAgeMs = 1000 * 60 * 60 * 24 * 7;

// Admin panel: gated by a single shared password (separate from user accounts).
const ADMIN_TOKEN_COOKIE_NAME = "tcg_admin_token";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "";
const adminTokenMaxAgeMs = 1000 * 60 * 60 * 24; // 1 day

app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.AUTH_CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// ── Pool sync ─────────────────────────────────────────────────────────────────

function syncCardPool(allCards, copiesPerRarity) {
  const existingPool = new Map(
    db.prepare("SELECT card_id, collection_id, rarity, total_copies FROM card_pool").all().map((r) => [r.card_id, r]),
  );
  const catalogIds = new Set(allCards.map((c) => c.id));

  const stmtInsert = db.prepare(
    "INSERT INTO card_pool (card_id, collection_id, rarity, total_copies, copies_remaining) VALUES (?, ?, ?, ?, ?)",
  );
  const stmtUpdate = db.prepare(
    "UPDATE card_pool SET rarity = ?, total_copies = ?, copies_remaining = MAX(0, copies_remaining + ?) WHERE card_id = ?",
  );
  const stmtZero = db.prepare("UPDATE card_pool SET copies_remaining = 0 WHERE card_id = ?");
  const stmtCountOwned = db.prepare("SELECT COUNT(*) as n FROM owned_cards WHERE card_id = ?");

  db.transaction(() => {
    for (const card of allCards) {
      const total = copiesPerRarity[card.rarity] ?? 10;
      const existing = existingPool.get(card.id);
      if (!existing) {
        const alreadyOwned = stmtCountOwned.get(card.id).n;
        const remaining = Math.max(0, total - alreadyOwned);
        stmtInsert.run(card.id, card.collectionId ?? "sm2026", card.rarity, total, remaining);
      } else if (existing.total_copies !== total || existing.rarity !== card.rarity) {
        // Copies or rarity changed — adjust remaining by the delta
        const delta = total - existing.total_copies;
        stmtUpdate.run(card.rarity, total, delta, card.id);
      }
    }
    for (const cardId of existingPool.keys()) {
      if (!catalogIds.has(cardId)) stmtZero.run(cardId);
    }
  })();
}

// ── Startup: load catalog once ────────────────────────────────────────────────

const { cards: allCards, collections, dailyDiamonds, copiesPerRarity } = await loadGameCatalog();
const cardById = new Map(allCards.map((c) => [c.id, c]));
const collectionsMap = new Map(collections.map((c) => [c.id, c]));
syncCardPool(allCards, copiesPerRarity);

const achievementDefinitions = buildAchievementDefinitions(allCards, collections);
const achievementById = new Map(achievementDefinitions.map((a) => [a.id, a]));

const rarityBreakdown = ["special", "legendary", "epic", "rare", "common"]
  .map((r) => `${allCards.filter((c) => c.rarity === r).length} ${r}`)
  .join(", ");
console.log(`Card pool ready — ${allCards.length} cards (${rarityBreakdown}) across ${collections.length} collection(s).`);

// ── Auth helpers ──────────────────────────────────────────────────────────────

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.created_at,
    firstName: user.first_name ?? null,
    lastName: user.last_name ?? null,
    // The frontend gates the whole app on this flag. It is derived rather than
    // stored so it can never drift out of sync with the columns themselves.
    profileComplete: Boolean(user.first_name && user.last_name),
  };
}

function setAuthCookie(response, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  response.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: tokenMaxAgeMs,
  });
}

function clearAuthCookie(response) {
  response.clearCookie(TOKEN_COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: IS_PRODUCTION });
}

function requireAuth(request, response, next) {
  const token = request.cookies[TOKEN_COOKIE_NAME];
  if (!token) { response.status(401).json({ message: "Not authenticated" }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    // The JWT alone doesn't prove the account still exists — a session issued
    // before an admin deletion stays cryptographically valid for up to 7 days.
    // Without this check, every route that touches player_state (e.g.
    // ensurePlayerState) throws a raw FOREIGN KEY SqliteError once the user
    // row is gone, which Express turns into a stack-trace-leaking 500.
    if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(payload.userId)) {
      throw new Error("Account no longer exists");
    }
    request.auth = payload;
    next();
  } catch {
    clearAuthCookie(response);
    response.status(401).json({ message: "Invalid session" });
  }
}

function setAdminCookie(response) {
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: "1d" });
  response.cookie(ADMIN_TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: IS_PRODUCTION,
    maxAge: adminTokenMaxAgeMs,
  });
}

function clearAdminCookie(response) {
  response.clearCookie(ADMIN_TOKEN_COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: IS_PRODUCTION });
}

function requireAdmin(request, response, next) {
  const token = request.cookies[ADMIN_TOKEN_COOKIE_NAME];
  if (!token) { response.status(401).json({ message: "Inte inloggad som admin." }); return; }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload.admin) throw new Error("not admin");
    next();
  } catch {
    clearAdminCookie(response);
    response.status(401).json({ message: "Ogiltig admin-session." });
  }
}

const NAME_REQUIREMENTS_MESSAGE =
  "Förnamn och efternamn måste vara minst 2 tecken vardera.";
const MAX_NAME_LENGTH = 50;

// Collapse internal whitespace so " Anna   Maria " and "Anna Maria" are stored
// identically — names are compared by eye in the admin panel.
function normalizeName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

function isValidName(value) {
  return value.length >= 2 && value.length <= MAX_NAME_LENGTH;
}

const PASSWORD_REQUIREMENTS_MESSAGE =
  "Lösenordet måste vara minst 8 tecken och innehålla minst en stor bokstav, en liten bokstav och en siffra.";

function isStrongPassword(password) {
  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

// ── Auth routes ───────────────────────────────────────────────────────────────

app.get("/api/health", (_request, response) => { response.json({ ok: true }); });

app.post("/api/auth/register", async (request, response) => {
  const username = String(request.body?.username ?? "").trim();
  const email = String(request.body?.email ?? "").trim().toLowerCase();
  const password = String(request.body?.password ?? "");
  const firstName = normalizeName(request.body?.firstName);
  const lastName = normalizeName(request.body?.lastName);

  if (!username || !email || !password) {
    response.status(400).json({ message: "Username, email, and password are required." });
    return;
  }
  if (!isValidName(firstName) || !isValidName(lastName)) {
    response.status(400).json({ message: NAME_REQUIREMENTS_MESSAGE });
    return;
  }
  if (!isStrongPassword(password)) {
    response.status(400).json({ message: PASSWORD_REQUIREMENTS_MESSAGE });
    return;
  }

  if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) {
    response.status(409).json({ message: "An account with that email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO users (id, username, email, password_hash, created_at, first_name, last_name) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, username, email, passwordHash, new Date().toISOString(), firstName, lastName);

  ensurePlayerState(id);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id);
  setAuthCookie(response, { userId: id, email });
  response.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", async (request, response) => {
  const email = String(request.body?.email ?? "").trim().toLowerCase();
  const password = String(request.body?.password ?? "");

  if (!email || !password) {
    response.status(400).json({ message: "Email and password are required." });
    return;
  }

  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    response.status(401).json({ message: "Invalid email or password." });
    return;
  }

  setAuthCookie(response, { userId: user.id, email: user.email });
  response.json({ user: publicUser(user) });
});

app.post("/api/auth/forgot-password", async (request, response) => {
  try {
    const email = String(request.body?.email ?? "").trim().toLowerCase();
    if (!email) { response.status(400).json({ message: "E-post krävs." }); return; }

    const user = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
    // Always respond OK — never reveal whether the email exists
    if (!user) { response.json({ ok: true }); return; }

    // Invalidate any old tokens for this user
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(user.id);

    const token = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 h
    db.prepare(
      "INSERT INTO password_reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)",
    ).run(token, user.id, expiresAt);

    const appUrl = process.env.APP_URL ?? "http://localhost:5173";
    const resetUrl = `${appUrl}/aterstall-losenord?token=${token}`;
    await sendPasswordResetEmail(email, resetUrl);

    response.json({ ok: true });
  } catch (err) {
    console.error("[forgot-password]", err);
    response.status(500).json({ message: "Serverfel. Försök igen senare." });
  }
});

app.post("/api/auth/reset-password", async (request, response) => {
  try {
    const token = String(request.body?.token ?? "").trim();
    const newPassword = String(request.body?.newPassword ?? "");

    if (!token || !newPassword) {
      response.status(400).json({ message: "Token och nytt lösenord krävs." }); return;
    }
    if (!isStrongPassword(newPassword)) {
      response.status(400).json({ message: PASSWORD_REQUIREMENTS_MESSAGE }); return;
    }

    const row = db.prepare(
      "SELECT * FROM password_reset_tokens WHERE token = ? AND used = 0",
    ).get(token);

    if (!row) {
      response.status(400).json({ message: "Ogiltig eller redan använd återställningslänk." }); return;
    }
    if (new Date(row.expires_at) < new Date()) {
      response.status(400).json({ message: "Länken har gått ut. Begär en ny återställning." }); return;
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);
    db.transaction(() => {
      db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(passwordHash, row.user_id);
      db.prepare("UPDATE password_reset_tokens SET used = 1 WHERE token = ?").run(token);
    })();

    response.json({ ok: true });
  } catch (err) {
    console.error("[reset-password]", err);
    response.status(500).json({ message: "Serverfel. Försök igen senare." });
  }
});

app.post("/api/auth/logout", (_request, response) => {
  clearAuthCookie(response);
  response.status(204).send();
});

app.get("/api/auth/me", requireAuth, (request, response) => {
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(request.auth.userId);
  if (!user) {
    clearAuthCookie(response);
    response.status(401).json({ message: "Session user no longer exists." });
    return;
  }
  response.json({ user: publicUser(user) });
});

// Fills in the names for an account that predates them (and lets anyone fix a
// typo later). Deliberately NOT behind requireCompleteProfile — it is the one
// authenticated route an incomplete account must still be able to reach.
app.patch("/api/auth/profile", requireAuth, (request, response) => {
  const firstName = normalizeName(request.body?.firstName);
  const lastName = normalizeName(request.body?.lastName);

  if (!isValidName(firstName) || !isValidName(lastName)) {
    response.status(400).json({ message: NAME_REQUIREMENTS_MESSAGE });
    return;
  }

  db.prepare("UPDATE users SET first_name = ?, last_name = ? WHERE id = ?")
    .run(firstName, lastName, request.auth.userId);

  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(request.auth.userId);
  response.json({ user: publicUser(user) });
});

// ── Profile-completion gate ───────────────────────────────────────────────────
// Accounts created before names were mandatory have NULL name columns. The UI
// funnels them into a completion screen, but the UI is not a security boundary:
// without this guard anyone could keep playing straight through the API with
// curl. Every authenticated gameplay route below is registered with `authed`
// (requireAuth + this) rather than requireAuth alone. Deliberately excluded:
// /api/auth/me and /api/auth/profile (needed to detect and fix the gap),
// /api/auth/logout, and the admin routes, which use their own password cookie.
function requireCompleteProfile(request, response, next) {
  const user = db
    .prepare("SELECT first_name, last_name FROM users WHERE id = ?")
    .get(request.auth.userId);

  if (!user?.first_name || !user?.last_name) {
    response.status(403).json({
      code: "PROFILE_INCOMPLETE",
      message: "Du måste fylla i förnamn och efternamn innan du kan fortsätta.",
    });
    return;
  }
  next();
}

const authed = [requireAuth, requireCompleteProfile];

// ── Game helpers ──────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayIso() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

const STARTING_DIAMONDS = 500;

// Claim the daily diamonds on 7 consecutive days (no gap) and get a one-time
// bonus on top of that day's normal claim. The streak then resets to 0, so
// the next claim starts a brand new 7-day run; missing a single day resets
// it too (the next claim after a gap starts over at 1, not 0, since that
// claim itself is day one of the new streak).
const DIAMOND_STREAK_TARGET = 7;
const DIAMOND_STREAK_BONUS = 500;

function ensurePlayerState(userId) {
  if (!db.prepare("SELECT user_id FROM player_state WHERE user_id = ?").get(userId)) {
    db.prepare(
      "INSERT INTO player_state (user_id, diamonds, last_daily_claim_date, last_opened_cards) VALUES (?, ?, NULL, '[]')",
    ).run(userId, STARTING_DIAMONDS);
  }
}

function buildStateResponse(userId) {
  ensurePlayerState(userId);
  const state = db.prepare("SELECT * FROM player_state WHERE user_id = ?").get(userId);
  const ownedCardIds = db
    .prepare("SELECT card_id FROM owned_cards WHERE user_id = ?")
    .all(userId)
    .map((r) => r.card_id);

  return {
    ownedCardIds,
    diamonds: state.diamonds,
    lastDailyClaimDate: state.last_daily_claim_date,
    canClaimDailyDiamonds: state.last_daily_claim_date !== todayIso(),
    lastOpenedCards: JSON.parse(state.last_opened_cards),
    diamondStreak: state.diamond_streak,
    diamondStreakTarget: DIAMOND_STREAK_TARGET,
  };
}

// Special cards ARE obtainable from packs (2026-09-21) — they just fold into
// the same scarcity-weighted draw as everything else, so their odds come
// naturally from how few copies exist (1 each, 5 total system-wide) rather
// than from a hand-picked percentage.
const stmtSumAvailableCopies = db.prepare(
  "SELECT COALESCE(SUM(copies_remaining), 0) AS total FROM card_pool WHERE collection_id = ? AND copies_remaining > 0",
);
const stmtPickWeightedCard = db.prepare(
  `SELECT card_id FROM (
     SELECT card_id, SUM(copies_remaining) OVER (ORDER BY card_id) AS cum
     FROM card_pool
     WHERE collection_id = ? AND copies_remaining > 0
   ) WHERE cum > ? ORDER BY cum LIMIT 1`,
);
const stmtDecrementCard = db.prepare(
  "UPDATE card_pool SET copies_remaining = copies_remaining - 1 WHERE card_id = ?",
);

// Draw one card weighted by how many copies are still in the pool, so every
// physical copy is equally likely. The odds of a rarity therefore equal that
// rarity's remaining copies divided by all remaining copies —
// e.g. at a full pool, legendary = 25 / (25 + 120 + 550 + 19300 + 5) and
// special = 5 / that same total (one copy each, so each specific special
// card is a 1-in-20,000 pull).
const drawCardTx = db.transaction((collectionId) => {
  const { total } = stmtSumAvailableCopies.get(collectionId);
  if (total <= 0) return null;
  const pick = Math.floor(Math.random() * total);
  const row = stmtPickWeightedCard.get(collectionId, pick);
  if (!row) return null;
  stmtDecrementCard.run(row.card_id);
  return row.card_id;
});

function openPackCards(packConfig, collectionId) {
  const pulled = [];
  for (let i = 0; i < packConfig.cardCount; i++) {
    const cardId = drawCardTx(collectionId);
    if (!cardId) continue;
    const card = cardById.get(cardId);
    if (card) pulled.push(card);
  }
  return pulled;
}

// Cards required to upgrade, keyed by the source rarity being combined.
const UPGRADE_CARDS_REQUIRED = { common: 20, rare: 15, epic: 10 };
const TIER_UPGRADE_TARGET = { common: "rare", rare: "epic", epic: "legendary" };

const stmtPickCardOfRarity = db.prepare(
  "SELECT card_id FROM card_pool WHERE collection_id = ? AND rarity = ? AND copies_remaining > 0 ORDER BY RANDOM() LIMIT 1",
);

// ── Game routes ───────────────────────────────────────────────────────────────

app.get("/api/game/state", authed, (request, response) => {
  response.json(buildStateResponse(request.auth.userId));
});

app.get("/api/game/pool", (_request, response) => {
  const rows = db
    .prepare("SELECT card_id, collection_id, total_copies, copies_remaining FROM card_pool")
    .all();
  const result = {};
  for (const row of rows) {
    result[row.card_id] = {
      collectionId: row.collection_id,
      totalCopies: row.total_copies,
      copiesRemaining: row.copies_remaining,
    };
  }
  response.json(result);
});

app.get("/api/game/collections", (_request, response) => {
  response.json(collections);
});

// Leaderboard — players ranked strictly by rarity tier: most legendaries wins,
// and only on a tie do we look one tier down (epic, then rare, then common).
// Total card count is never used for ranking, only shown for context: a player
// with 2 legendaries beats a player with 1 legendary and 200 other cards.
// Special cards are not counted.
const LEADERBOARD_RARITIES = ["common", "rare", "epic", "legendary"];

app.get("/api/leaderboard", authed, (_request, response) => {
  const users = db.prepare("SELECT id, username FROM users").all();
  const ownedStmt = db.prepare("SELECT card_id FROM owned_cards WHERE user_id = ?");

  const entries = users.map((u) => {
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const row of ownedStmt.all(u.id)) {
      const card = cardById.get(row.card_id);
      if (card && counts[card.rarity] !== undefined) counts[card.rarity] += 1;
    }
    const total = LEADERBOARD_RARITIES.reduce((sum, r) => sum + counts[r], 0);
    return { userId: u.id, username: u.username, total, ...counts };
  });

  entries.sort((a, b) =>
    b.legendary - a.legendary ||
    b.epic - a.epic ||
    b.rare - a.rare ||
    b.common - a.common ||
    a.username.localeCompare(b.username, "sv"),
  );

  response.json(entries.slice(0, 100).map((e, i) => ({ rank: i + 1, ...e })));
});

app.post("/api/game/claim-daily-diamonds", authed, (request, response) => {
  ensurePlayerState(request.auth.userId);
  const state = db
    .prepare("SELECT last_daily_claim_date, diamond_streak FROM player_state WHERE user_id = ?")
    .get(request.auth.userId);

  if (state.last_daily_claim_date === todayIso()) {
    response.status(400).json({ message: "Dagliga diamanter redan hämtade." });
    return;
  }

  // A claim yesterday keeps the streak going; anything else (never claimed,
  // or a gap of one day or more) starts a new streak at 1 — today is its
  // first day.
  const continuesStreak = state.last_daily_claim_date === yesterdayIso();
  let streak = continuesStreak ? state.diamond_streak + 1 : 1;

  let streakBonusAwarded = 0;
  if (streak >= DIAMOND_STREAK_TARGET) {
    streakBonusAwarded = DIAMOND_STREAK_BONUS;
    streak = 0; // paid out — next claim starts a fresh 7-day run
  }

  const diamondsAwarded = dailyDiamonds + streakBonusAwarded;

  db.prepare(
    "UPDATE player_state SET diamonds = diamonds + ?, last_daily_claim_date = ?, diamond_streak = ? WHERE user_id = ?",
  ).run(diamondsAwarded, todayIso(), streak, request.auth.userId);

  response.json({
    diamondsAwarded,
    streakBonusAwarded,
    diamondStreak: streak,
    state: buildStateResponse(request.auth.userId),
  });
});

// ── Announcements ────────────────────────────────────────────────────────────
// News shown from the megaphone dropdown in the header. Published/removed by
// admins (see admin routes below); every player just reads the list and has
// their own "have I seen the latest one" marker.

function latestAnnouncementCreatedAt() {
  return db.prepare("SELECT created_at FROM announcements ORDER BY created_at DESC LIMIT 1").get()?.created_at ?? null;
}

app.get("/api/announcements", authed, (request, response) => {
  ensurePlayerState(request.auth.userId);
  const rows = db.prepare("SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC").all();
  const { last_seen_announcement_at } = db
    .prepare("SELECT last_seen_announcement_at FROM player_state WHERE user_id = ?")
    .get(request.auth.userId);

  const latest = rows[0]?.created_at ?? null;
  const hasUnseen = latest !== null && (!last_seen_announcement_at || last_seen_announcement_at < latest);

  response.json({
    announcements: rows.map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at })),
    hasUnseen,
  });
});

app.post("/api/announcements/seen", authed, (request, response) => {
  ensurePlayerState(request.auth.userId);
  const latest = latestAnnouncementCreatedAt();
  if (latest) {
    db.prepare("UPDATE player_state SET last_seen_announcement_at = ? WHERE user_id = ?")
      .run(latest, request.auth.userId);
  }
  response.status(204).send();
});

const ALLOWED_PACK_QUANTITIES = [1, 5, 10];

app.post("/api/game/buy-pack", authed, (request, response) => {
  const collectionId = String(request.body?.collectionId ?? "").trim();
  if (!collectionId) {
    response.status(400).json({ message: "collectionId krävs." });
    return;
  }

  const collection = collectionsMap.get(collectionId);
  if (!collection) {
    response.status(400).json({ message: "Okänd kollektion." });
    return;
  }

  const quantity = Math.floor(Number(request.body?.quantity ?? 1));
  if (!ALLOWED_PACK_QUANTITIES.includes(quantity)) {
    response.status(400).json({ message: "Ogiltigt antal pack." });
    return;
  }
  const totalPrice = collection.pack.price * quantity;

  ensurePlayerState(request.auth.userId);
  const state = db
    .prepare("SELECT diamonds FROM player_state WHERE user_id = ?")
    .get(request.auth.userId);

  if (state.diamonds < totalPrice) {
    response.status(400).json({ message: "Inte tillräckligt med diamanter." });
    return;
  }

  const pulledCards = [];
  for (let i = 0; i < quantity; i++) {
    pulledCards.push(...openPackCards(collection.pack, collectionId));
  }

  db.transaction(() => {
    db.prepare(
      "UPDATE player_state SET diamonds = diamonds - ?, last_opened_cards = ? WHERE user_id = ?",
    ).run(totalPrice, JSON.stringify(pulledCards), request.auth.userId);
    const stmtInsertCard = db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)");
    for (const card of pulledCards) stmtInsertCard.run(request.auth.userId, card.id);
  })();

  response.json({ pulledCards, state: buildStateResponse(request.auth.userId) });
});

app.post("/api/game/upgrade", authed, (request, response) => {
  const userId = request.auth.userId;
  const requestedCardIds = Array.isArray(request.body?.cardIds) ? request.body.cardIds.map(String) : [];

  if (requestedCardIds.length === 0) {
    response.status(400).json({ message: "Du måste välja kort att uppgradera." });
    return;
  }

  const requestedCards = requestedCardIds.map((id) => cardById.get(id));
  if (requestedCards.some((c) => !c)) {
    response.status(400).json({ message: "Okänt kort." });
    return;
  }

  const collectionId = requestedCards[0].collectionId;
  const rarity = requestedCards[0].rarity;
  const sameGroup = requestedCards.every((c) => c.collectionId === collectionId && c.rarity === rarity);
  if (!sameGroup) {
    response.status(400).json({ message: "Alla kort måste ha samma raritet och tillhöra samma kortpaket." });
    return;
  }

  const targetRarity = TIER_UPGRADE_TARGET[rarity];
  if (!targetRarity) {
    response.status(400).json({ message: "Den rariteten kan inte uppgraderas." });
    return;
  }

  const requiredCount = UPGRADE_CARDS_REQUIRED[rarity];
  if (requestedCardIds.length !== requiredCount) {
    response.status(400).json({ message: `Du måste välja exakt ${requiredCount} kort.` });
    return;
  }

  const requestedCounts = new Map();
  for (const id of requestedCardIds) requestedCounts.set(id, (requestedCounts.get(id) ?? 0) + 1);

  const ownedRows = db.prepare("SELECT id, card_id FROM owned_cards WHERE user_id = ?").all(userId);
  const ownedRowsByCard = new Map();
  for (const row of ownedRows) {
    if (!ownedRowsByCard.has(row.card_id)) ownedRowsByCard.set(row.card_id, []);
    ownedRowsByCard.get(row.card_id).push(row.id);
  }

  const rowsToDelete = [];
  for (const [cardId, count] of requestedCounts) {
    const rows = ownedRowsByCard.get(cardId) ?? [];
    if (rows.length < count) {
      response.status(400).json({ message: "Du äger inte alla valda kort." });
      return;
    }
    rowsToDelete.push(...rows.slice(0, count).map((rowId) => ({ id: rowId, card_id: cardId })));
  }

  const targetCardId = stmtPickCardOfRarity.get(collectionId, targetRarity)?.card_id;
  if (!targetCardId) {
    response.status(400).json({ message: "Inga kort kvar att uppgradera till just nu." });
    return;
  }

  const upgradedCard = db.transaction(() => {
    const stmtDeleteOwned = db.prepare("DELETE FROM owned_cards WHERE id = ?");
    const stmtReturnToPool = db.prepare("UPDATE card_pool SET copies_remaining = copies_remaining + 1 WHERE card_id = ?");
    for (const row of rowsToDelete) {
      stmtDeleteOwned.run(row.id);
      stmtReturnToPool.run(row.card_id);
    }

    db.prepare("UPDATE card_pool SET copies_remaining = copies_remaining - 1 WHERE card_id = ?").run(targetCardId);
    db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)").run(userId, targetCardId);

    return cardById.get(targetCardId);
  })();

  response.json({ upgradedCard, state: buildStateResponse(userId) });
});

// ── Achievements ──────────────────────────────────────────────────────────────

function buildAchievementsResponse(userId) {
  const ownedCardIdSet = new Set(
    db.prepare("SELECT DISTINCT card_id FROM owned_cards WHERE user_id = ?").all(userId).map((r) => r.card_id),
  );
  const claimedIds = new Set(
    db.prepare("SELECT achievement_id FROM achievement_claims WHERE user_id = ?").all(userId).map((r) => r.achievement_id),
  );

  return achievementDefinitions.map((definition) => {
    const { progress, target, complete } = computeAchievementProgress(definition, ownedCardIdSet, allCards);
    return {
      id: definition.id,
      title: definition.title,
      description: definition.description,
      reward: definition.reward,
      progress,
      target,
      complete,
      claimed: claimedIds.has(definition.id),
      collectionId: definition.collectionId,
    };
  });
}

app.get("/api/achievements", authed, (request, response) => {
  response.json(buildAchievementsResponse(request.auth.userId));
});

app.post("/api/achievements/:id/claim", authed, (request, response) => {
  const definition = achievementById.get(request.params.id);
  if (!definition) { response.status(404).json({ message: "Okänd prestation." }); return; }

  const userId = request.auth.userId;
  if (db.prepare("SELECT 1 FROM achievement_claims WHERE user_id = ? AND achievement_id = ?").get(userId, definition.id)) {
    response.status(400).json({ message: "Prestationen är redan inlöst." }); return;
  }

  const ownedCardIdSet = new Set(
    db.prepare("SELECT DISTINCT card_id FROM owned_cards WHERE user_id = ?").all(userId).map((r) => r.card_id),
  );
  const { complete } = computeAchievementProgress(definition, ownedCardIdSet, allCards);
  if (!complete) { response.status(400).json({ message: "Prestationen är inte klar än." }); return; }

  ensurePlayerState(userId);
  db.transaction(() => {
    db.prepare(
      "INSERT INTO achievement_claims (user_id, achievement_id, claimed_at) VALUES (?, ?, ?)",
    ).run(userId, definition.id, new Date().toISOString());
    db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(definition.reward, userId);
  })();

  response.json({ diamondsAwarded: definition.reward, achievements: buildAchievementsResponse(userId), state: buildStateResponse(userId) });
});

// ── Trade helpers ─────────────────────────────────────────────────────────────

// Relative card values come straight from the game's own upgrade ladder
// (UPGRADE_CARDS_REQUIRED above): 20 commons make a rare, 15 rares an epic,
// 10 epics a legendary. That is the exchange rate the economy already declares,
// so it is also the rate someone funnelling cards between their own accounts is
// arbitraging. "special" sits outside the ladder (one copy each, extremely
// rare pack pulls) — 2x legendary is a judgement call; tune it here if it
// misjudges real trades. Used only for admin fraud heuristics, never for gameplay.
const RARITY_VALUE = { common: 1, rare: 20, epic: 300, legendary: 3000, special: 6000 };

// Diamonds expressed in the same unit, derived from what a pack actually costs:
// `price` diamonds buys `cardCount` cards, so one diamond is worth a pack's
// expected card value divided by its price. Falls back to a flat rate if a
// collection ships without usable pack odds.
const DIAMOND_VALUE = (() => {
  const pack = collections[0]?.pack;
  const chances = pack?.rarityChances;
  if (!pack?.price || !pack?.cardCount || !chances) return 10;
  const expectedPerCard = Object.entries(chances).reduce(
    (sum, [rarity, chance]) => sum + (RARITY_VALUE[rarity] ?? 0) * Number(chance ?? 0),
    0,
  );
  if (expectedPerCard <= 0) return 10;
  return (expectedPerCard * pack.cardCount) / pack.price;
})();

// A trade this far out of balance is worth a human look. Two accounts run by the
// same person have no reason to trade fairly, so a persistently one-sided pair is
// the strongest signal available without device or IP fingerprinting.
const LOPSIDED_RATIO = 3;
const VERY_LOPSIDED_RATIO = 10;

// Accounts registered within this window of each other are worth noticing when
// they also trade heavily with one another.
const SAME_SIGNUP_WINDOW_MINUTES = 60;

function cardValue(cardId) {
  return RARITY_VALUE[cardById.get(cardId)?.rarity] ?? RARITY_VALUE.common;
}

function sideValue(cardIds, diamonds) {
  return cardIds.reduce((sum, id) => sum + cardValue(id), 0) + Number(diamonds ?? 0) * DIAMOND_VALUE;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

// Values a trade from both directions. `senderValue` is what the sender hands
// over, `receiverValue` what the receiver hands over, so a positive `senderNet`
// means the sender came out ahead.
function analyzeTrade(row) {
  const offeredCardIds = JSON.parse(row.offered_card_ids);
  const requestedCardIds = JSON.parse(row.requested_card_ids);
  const senderValue = sideValue(offeredCardIds, row.offered_diamonds);
  const receiverValue = sideValue(requestedCardIds, row.requested_diamonds);

  const high = Math.max(senderValue, receiverValue);
  const low = Math.min(senderValue, receiverValue);
  // null rather than Infinity — JSON.stringify turns Infinity into null anyway,
  // so make the "one side gave nothing" case explicit instead of accidental.
  const ratio = low > 0 ? round1(high / low) : null;

  const flags = [];
  if (low <= 0) flags.push("gift");
  else if (ratio >= VERY_LOPSIDED_RATIO) flags.push("very_lopsided");
  else if (ratio >= LOPSIDED_RATIO) flags.push("lopsided");

  // Round each side first, then subtract, so the three figures always add up on
  // screen. Rounding the raw difference separately drifts by up to 0.1 (a
  // diamond is worth 10.075), which reads as an arithmetic error in the admin
  // tables even though every individual figure is correct. The outer round1
  // only clears float noise from the subtraction.
  const senderValueRounded = round1(senderValue);
  const receiverValueRounded = round1(receiverValue);

  return {
    offeredCardIds,
    requestedCardIds,
    senderValue: senderValueRounded,
    receiverValue: receiverValueRounded,
    senderNet: round1(receiverValueRounded - senderValueRounded),
    ratio,
    favours: senderValue === receiverValue ? "even" : senderValue < receiverValue ? "sender" : "receiver",
    flags,
  };
}

function tallyIds(ids) {
  const counts = new Map();
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1);
  return counts;
}

function buildTrade(row) {
  return {
    id: row.id,
    status: row.status,
    sender: { id: row.sender_user_id, username: row.sender_username },
    receiver: { id: row.receiver_user_id, username: row.receiver_username },
    offeredCardIds: JSON.parse(row.offered_card_ids),
    offeredDiamonds: row.offered_diamonds,
    requestedCardIds: JSON.parse(row.requested_card_ids),
    requestedDiamonds: row.requested_diamonds,
    createdAt: row.created_at,
    counterOfTradeId: row.counter_of_trade_id ?? null,
  };
}

const stmtTradeById = db.prepare(`
  SELECT t.*, su.username AS sender_username, ru.username AS receiver_username
  FROM trades t
  JOIN users su ON su.id = t.sender_user_id
  JOIN users ru ON ru.id = t.receiver_user_id
  WHERE t.id = ?
`);

// ── User routes ───────────────────────────────────────────────────────────────

app.get("/api/users/search", authed, (request, response) => {
  const q = String(request.query.q ?? "").trim();
  if (q.length < 2) { response.json([]); return; }
  const users = db
    .prepare("SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 10")
    .all(`%${q}%`, request.auth.userId);
  response.json(users);
});

app.get("/api/users/:userId/cards", authed, (request, response) => {
  const ownedCardIds = db
    .prepare("SELECT card_id FROM owned_cards WHERE user_id = ?")
    .all(request.params.userId)
    .map((r) => r.card_id);
  response.json({ ownedCardIds });
});

// Public profile for another player: their username plus the cards they own and
// the ones they have marked for trade. Backs the "view a player's collection"
// page reachable from the leaderboard.
app.get("/api/users/:userId/profile", authed, (request, response) => {
  const user = db
    .prepare("SELECT id, username, first_name, last_name FROM users WHERE id = ?")
    .get(request.params.userId);
  if (!user) {
    response.status(404).json({ message: "Spelaren hittades inte." });
    return;
  }

  const ownedCardIds = db
    .prepare("SELECT card_id FROM owned_cards WHERE user_id = ?")
    .all(user.id)
    .map((r) => r.card_id);

  const owned = ownedCountMap(user.id);
  const cardsForTrade = db
    .prepare("SELECT card_id, quantity FROM cards_for_trade WHERE user_id = ?")
    .all(user.id)
    .map((r) => ({ cardId: r.card_id, quantity: Math.min(r.quantity, owned.get(r.card_id) ?? 0) }))
    .filter((r) => r.quantity > 0);

  response.json({
    // Real names are shown on the player's collection page. Null only for
    // accounts that predate mandatory names and have not logged in since.
    user: {
      id: user.id,
      username: user.username,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
    },
    ownedCardIds,
    cardsForTrade,
    isSelf: user.id === request.auth.userId,
  });
});

// ── Cards-for-trade routes ────────────────────────────────────────────────────

function ownedCountMap(userId) {
  const rows = db.prepare("SELECT card_id, COUNT(*) AS n FROM owned_cards WHERE user_id = ? GROUP BY card_id").all(userId);
  return new Map(rows.map((r) => [r.card_id, r.n]));
}

// Marked-for-trade cards for the current user, each capped at how many copies
// they still own.
app.get("/api/game/cards-for-trade", authed, (request, response) => {
  const owned = ownedCountMap(request.auth.userId);
  const rows = db.prepare("SELECT card_id, quantity FROM cards_for_trade WHERE user_id = ?").all(request.auth.userId);
  const result = rows
    .map((r) => ({ cardId: r.card_id, quantity: Math.min(r.quantity, owned.get(r.card_id) ?? 0) }))
    .filter((r) => r.quantity > 0);
  response.json(result);
});

// Replace the user's entire marked-for-trade set with the provided quantities.
app.post("/api/game/cards-for-trade", authed, (request, response) => {
  const userId = request.auth.userId;
  const items = Array.isArray(request.body?.items) ? request.body.items : [];
  const owned = ownedCountMap(userId);

  const clean = [];
  for (const item of items) {
    const cardId = String(item?.cardId ?? "").trim();
    const ownedCount = owned.get(cardId) ?? 0;
    if (!cardId || ownedCount <= 0) continue;
    const quantity = Math.max(0, Math.min(ownedCount, Math.floor(Number(item?.quantity ?? 0))));
    if (quantity > 0) clean.push({ cardId, quantity });
  }

  db.transaction(() => {
    db.prepare("DELETE FROM cards_for_trade WHERE user_id = ?").run(userId);
    const ins = db.prepare("INSERT INTO cards_for_trade (user_id, card_id, quantity) VALUES (?, ?, ?)");
    for (const c of clean) ins.run(userId, c.cardId, c.quantity);
  })();

  response.json(clean);
});

app.get("/api/users/:userId/cards-for-trade", authed, (request, response) => {
  // Only return cards that are both marked for trade AND still owned, capped at
  // the owned count.
  const owned = ownedCountMap(request.params.userId);
  const rows = db.prepare("SELECT card_id, quantity FROM cards_for_trade WHERE user_id = ?").all(request.params.userId);
  const cards = rows
    .map((r) => ({ cardId: r.card_id, quantity: Math.min(r.quantity, owned.get(r.card_id) ?? 0) }))
    .filter((r) => r.quantity > 0);
  response.json({ cards });
});

const RARITY_SORT = { special: 0, legendary: 1, epic: 2, rare: 3, common: 4 };

// ── Trade market routes ───────────────────────────────────────────────────────
// Two ways to find a trade besides searching for a username: search for a
// specific card and see who offers it, or browse every player's shelf.

// Every marked-for-trade row in the game, capped at what the owner still owns.
// Shared by both market endpoints so the "still owned" rule lives in one place.
function liveMarketRows() {
  const rows = db
    .prepare(
      `SELECT f.user_id, f.card_id, f.quantity, u.username,
              (SELECT COUNT(*) FROM owned_cards o WHERE o.user_id = f.user_id AND o.card_id = f.card_id) AS owned
       FROM cards_for_trade f
       JOIN users u ON u.id = f.user_id`,
    )
    .all();

  return rows
    .map((r) => ({
      userId: r.user_id,
      username: r.username,
      cardId: r.card_id,
      quantity: Math.min(r.quantity, r.owned),
    }))
    .filter((r) => r.quantity > 0 && cardById.has(r.cardId));
}

// Which players offer a given card. Excludes the caller — you cannot trade with
// yourself.
app.get("/api/market/card/:cardId", authed, (request, response) => {
  const cardId = String(request.params.cardId);
  if (!cardById.has(cardId)) {
    response.status(404).json({ message: "Okänt kort." });
    return;
  }

  const traders = liveMarketRows()
    .filter((r) => r.cardId === cardId && r.userId !== request.auth.userId)
    .map((r) => ({ userId: r.userId, username: r.username, quantity: r.quantity }))
    .sort((a, b) => b.quantity - a.quantity || a.username.localeCompare(b.username, "sv"));

  response.json({ cardId, traders });
});

// Every player with at least one card up for trade, so the market can be
// browsed without knowing who or what to look for.
app.get("/api/market/traders", authed, (request, response) => {
  const byUser = new Map();
  for (const row of liveMarketRows()) {
    if (row.userId === request.auth.userId) continue;
    if (!byUser.has(row.userId)) {
      byUser.set(row.userId, { userId: row.userId, username: row.username, cards: [] });
    }
    byUser.get(row.userId).cards.push({ cardId: row.cardId, quantity: row.quantity });
  }

  const traders = Array.from(byUser.values()).map((t) => ({
    ...t,
    cards: t.cards.sort((a, b) => {
      const ca = cardById.get(a.cardId);
      const cb = cardById.get(b.cardId);
      return (
        (RARITY_SORT[ca?.rarity] ?? 99) - (RARITY_SORT[cb?.rarity] ?? 99) ||
        (ca?.name ?? "").localeCompare(cb?.name ?? "", "sv")
      );
    }),
    totalCards: t.cards.reduce((sum, c) => sum + c.quantity, 0),
  }));

  traders.sort((a, b) => b.totalCards - a.totalCards || a.username.localeCompare(b.username, "sv"));
  response.json({ traders });
});

// ── Trade routes ──────────────────────────────────────────────────────────────

// Shared by /api/trade and /api/trade/:id/counter — a counter is just a new
// proposal with the two parties swapped, so it must clear exactly the same bar.
// Returns { status, message } on failure, or null when the proposal is valid.
function validateTradeProposal({
  senderId,
  receiverUserId,
  offeredCardIds,
  offeredDiamonds,
  requestedCardIds,
  requestedDiamonds,
}) {
  if (!receiverUserId) return { status: 400, message: "receiverUserId krävs." };
  if (receiverUserId === senderId) return { status: 400, message: "Du kan inte handla med dig själv." };
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(receiverUserId)) {
    return { status: 404, message: "Mottagaren hittades inte." };
  }
  if (offeredCardIds.length === 0 && offeredDiamonds === 0) {
    return { status: 400, message: "Du måste erbjuda minst ett kort eller diamanter." };
  }
  if (requestedCardIds.length === 0 && requestedDiamonds === 0) {
    return { status: 400, message: "Du måste begära minst ett kort eller diamanter." };
  }

  const stmtCountOwned = db.prepare("SELECT COUNT(*) AS n FROM owned_cards WHERE user_id = ? AND card_id = ?");
  for (const [cardId, need] of tallyIds(offeredCardIds)) {
    if (stmtCountOwned.get(senderId, cardId).n < need) {
      return { status: 400, message: "Du äger inte alla erbjudna kort." };
    }
  }
  // Any card the receiver actually owns may be asked for. The "vill byta" marks
  // are a signal of willingness (and what the market lists), not a gate: the
  // receiver still has to accept, so an unmarked request costs them nothing but
  // a decline. Applies to counter-offers too, which share this function.
  for (const [cardId, need] of tallyIds(requestedCardIds)) {
    if (stmtCountOwned.get(receiverUserId, cardId).n < need) {
      return { status: 400, message: "Mottagaren äger inte så många av ett begärt kort." };
    }
  }

  if (offeredDiamonds > 0) {
    ensurePlayerState(senderId);
    const ps = db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(senderId);
    if (ps.diamonds < offeredDiamonds) {
      return { status: 400, message: "Inte tillräckligt med diamanter." };
    }
  }

  return null;
}

const stmtInsertTrade = db.prepare(
  "INSERT INTO trades (id, sender_user_id, receiver_user_id, offered_card_ids, offered_diamonds, requested_card_ids, requested_diamonds, status, created_at, counter_of_trade_id) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)",
);

app.post("/api/trade", authed, (request, response) => {
  const senderId = request.auth.userId;
  const {
    receiverUserId,
    offeredCardIds = [],
    offeredDiamonds = 0,
    requestedCardIds = [],
    requestedDiamonds = 0,
  } = request.body ?? {};

  const invalid = validateTradeProposal({
    senderId, receiverUserId, offeredCardIds, offeredDiamonds, requestedCardIds, requestedDiamonds,
  });
  if (invalid) { response.status(invalid.status).json({ message: invalid.message }); return; }

  const id = crypto.randomUUID();
  stmtInsertTrade.run(
    id, senderId, receiverUserId,
    JSON.stringify(offeredCardIds), offeredDiamonds,
    JSON.stringify(requestedCardIds), requestedDiamonds,
    new Date().toISOString(), null,
  );

  response.status(201).json({ tradeId: id });
});

// Counter-offer: the recipient of a pending trade answers with their own terms.
// The original is closed as 'countered' (never silently edited — the admin trade
// report and the players' history both keep the offer as it stood) and a fresh
// pending trade is created with the two parties swapped, so the counter can in
// turn be accepted, declined, or countered again. Both steps run in one
// transaction, and the original is re-checked as still pending inside it so two
// simultaneous counters cannot both succeed.
app.post("/api/trade/:id/counter", authed, (request, response) => {
  const userId = request.auth.userId;
  const original = db.prepare("SELECT * FROM trades WHERE id = ?").get(request.params.id);

  if (!original) { response.status(404).json({ message: "Handel hittades inte." }); return; }
  if (original.receiver_user_id !== userId) {
    response.status(403).json({ message: "Bara mottagaren kan lämna ett motbud." }); return;
  }
  if (original.status !== "pending") {
    response.status(400).json({ message: "Handeln är inte längre aktiv." }); return;
  }

  const {
    offeredCardIds = [],
    offeredDiamonds = 0,
    requestedCardIds = [],
    requestedDiamonds = 0,
  } = request.body ?? {};

  // The counter always goes back to whoever opened the original.
  const receiverUserId = original.sender_user_id;

  const invalid = validateTradeProposal({
    senderId: userId, receiverUserId, offeredCardIds, offeredDiamonds, requestedCardIds, requestedDiamonds,
  });
  if (invalid) { response.status(invalid.status).json({ message: invalid.message }); return; }

  const id = crypto.randomUUID();
  try {
    db.transaction(() => {
      const changed = db
        .prepare("UPDATE trades SET status = 'countered' WHERE id = ? AND status = 'pending'")
        .run(original.id).changes;
      if (changed === 0) throw new Error("Handeln är inte längre aktiv.");

      stmtInsertTrade.run(
        id, userId, receiverUserId,
        JSON.stringify(offeredCardIds), offeredDiamonds,
        JSON.stringify(requestedCardIds), requestedDiamonds,
        new Date().toISOString(), original.id,
      );
    })();
  } catch (err) {
    response.status(409).json({ message: err.message });
    return;
  }

  response.status(201).json({ tradeId: id });
});

app.get("/api/trade", authed, (request, response) => {
  const userId = request.auth.userId;
  const rows = db.prepare(`
    SELECT t.*, su.username AS sender_username, ru.username AS receiver_username
    FROM trades t
    JOIN users su ON su.id = t.sender_user_id
    JOIN users ru ON ru.id = t.receiver_user_id
    WHERE t.sender_user_id = ? OR t.receiver_user_id = ?
    ORDER BY t.created_at DESC
  `).all(userId, userId);
  response.json(rows.map(buildTrade));
});

// Cheap poll for the "Byte" nav badge — how many trades are waiting on me.
app.get("/api/trade/incoming-count", authed, (request, response) => {
  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM trades WHERE receiver_user_id = ? AND status = 'pending'")
    .get(request.auth.userId);
  response.json({ count: n });
});

app.post("/api/trade/:id/accept", authed, (request, response) => {
  const userId = request.auth.userId;
  const row = stmtTradeById.get(request.params.id);

  if (!row) { response.status(404).json({ message: "Handel hittades inte." }); return; }
  if (row.receiver_user_id !== userId) { response.status(403).json({ message: "Inte behörig." }); return; }
  if (row.status !== "pending") { response.status(400).json({ message: "Handeln är inte längre aktiv." }); return; }

  const offeredCardIds = JSON.parse(row.offered_card_ids);
  const requestedCardIds = JSON.parse(row.requested_card_ids);
  const senderId = row.sender_user_id;

  try {
    db.transaction(() => {
      const stmtCountOwned = db.prepare("SELECT COUNT(*) AS n FROM owned_cards WHERE user_id = ? AND card_id = ?");
      for (const [cardId, need] of tallyIds(offeredCardIds)) {
        if (stmtCountOwned.get(senderId, cardId).n < need)
          throw new Error("Avsändaren äger inte längre alla erbjudna kort.");
      }
      for (const [cardId, need] of tallyIds(requestedCardIds)) {
        if (stmtCountOwned.get(userId, cardId).n < need)
          throw new Error("Du äger inte längre alla begärda kort.");
      }
      if (row.offered_diamonds > 0) {
        ensurePlayerState(senderId);
        const ps = db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(senderId);
        if (ps.diamonds < row.offered_diamonds) throw new Error("Avsändaren har inte tillräckligt med diamanter.");
      }
      if (row.requested_diamonds > 0) {
        ensurePlayerState(userId);
        const ps = db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(userId);
        if (ps.diamonds < row.requested_diamonds) throw new Error("Du har inte tillräckligt med diamanter.");
      }

      const stmtDel = db.prepare("DELETE FROM owned_cards WHERE id = (SELECT id FROM owned_cards WHERE user_id = ? AND card_id = ? LIMIT 1)");
      const stmtAdd = db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)");

      const stmtDelForTrade = db.prepare("DELETE FROM cards_for_trade WHERE user_id = ? AND card_id = ?");
      for (const cardId of offeredCardIds) {
        stmtDel.run(senderId, cardId); stmtAdd.run(userId, cardId);
        stmtDelForTrade.run(senderId, cardId);
      }
      for (const cardId of requestedCardIds) {
        stmtDel.run(userId, cardId); stmtAdd.run(senderId, cardId);
        stmtDelForTrade.run(userId, cardId);
      }

      if (row.offered_diamonds > 0) {
        db.prepare("UPDATE player_state SET diamonds = diamonds - ? WHERE user_id = ?").run(row.offered_diamonds, senderId);
        db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(row.offered_diamonds, userId);
      }
      if (row.requested_diamonds > 0) {
        db.prepare("UPDATE player_state SET diamonds = diamonds - ? WHERE user_id = ?").run(row.requested_diamonds, userId);
        db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(row.requested_diamonds, senderId);
      }

      db.prepare("UPDATE trades SET status = 'accepted' WHERE id = ?").run(row.id);
    })();

    response.json({ state: buildStateResponse(userId) });
  } catch (err) {
    response.status(409).json({ message: err.message });
  }
});

app.post("/api/trade/:id/reject", authed, (request, response) => {
  const userId = request.auth.userId;
  const row = db.prepare("SELECT * FROM trades WHERE id = ?").get(request.params.id);
  if (!row || row.receiver_user_id !== userId) { response.status(403).json({ message: "Inte behörig." }); return; }
  if (row.status !== "pending") { response.status(400).json({ message: "Handeln är inte längre aktiv." }); return; }
  db.prepare("UPDATE trades SET status = 'rejected' WHERE id = ?").run(row.id);
  response.status(204).send();
});

app.post("/api/trade/:id/cancel", authed, (request, response) => {
  const userId = request.auth.userId;
  const row = db.prepare("SELECT * FROM trades WHERE id = ?").get(request.params.id);
  if (!row || row.sender_user_id !== userId) { response.status(403).json({ message: "Inte behörig." }); return; }
  if (row.status !== "pending") { response.status(400).json({ message: "Handeln är inte längre aktiv." }); return; }
  db.prepare("UPDATE trades SET status = 'cancelled' WHERE id = ?").run(row.id);
  response.status(204).send();
});

// ── Chests ────────────────────────────────────────────────────────────────────
// Chests are bought in Handel, stored (locked) in Samling, and pay out diamonds
// plus a chance at cards once their timer runs out. Contents are rolled at
// collect time, not at purchase time, so a chest can never promise a card the
// pool has since run out of.

const HOUR_MS = 1000 * 60 * 60;

const CHEST_TYPES = {
  bronze: {
    id: "bronze",
    label: "Bronskista",
    price: 10,
    waitMs: 1 * HOUR_MS,
    diamonds: { min: 15, max: 30, step: 5 },
    // Each roll is independent.
    cardRolls: [
      { rarity: "common", chance: 0.25 },
      { rarity: "rare", chance: 0.001 },
    ],
  },
  silver: {
    id: "silver",
    label: "Silverkista",
    price: 25,
    waitMs: 5 * HOUR_MS,
    diamonds: { min: 50, max: 100, step: 5 },
    cardRolls: [
      { rarity: "common", chance: 0.25 },
      { rarity: "common", chance: 0.25 },
      { rarity: "rare", chance: 0.025 },
    ],
  },
  gold: {
    id: "gold",
    label: "Guldkista",
    price: 50,
    waitMs: 12 * HOUR_MS,
    diamonds: { min: 100, max: 250, step: 5 },
    cardRolls: [
      { rarity: "common", chance: 0.25 },
      { rarity: "common", chance: 0.25 },
      { rarity: "common", chance: 0.25 },
      { rarity: "rare", chance: 0.025 },
      { rarity: "epic", chance: 0.0001 },
    ],
  },
};

// Chest storage: one free universal slot everyone has, plus at most one bought
// slot per chest type. A dedicated slot only ever holds its own type, so the
// ceiling is 1 + 3 = 4 chests.
const CHEST_SLOT_PRICES = { bronze: 1000, silver: 3000, gold: 5000 };

// Swedish labels for the slots themselves — "Bronskista" doesn't inflect into a
// slot name on its own ("bronskistaplats"), so the words are spelled out.
const CHEST_SLOT_LABELS = {
  bronze: { slot: "bronsplats", plural: "bronskistor" },
  silver: { slot: "silverplats", plural: "silverkistor" },
  gold: { slot: "guldplats", plural: "guldkistor" },
};
const FREE_CHEST_SLOTS = 1;
const MAX_CHEST_SLOTS = FREE_CHEST_SLOTS + Object.keys(CHEST_SLOT_PRICES).length;

/** Which dedicated slots this user has bought, as a Set of chest types. */
function dedicatedSlotsFor(userId) {
  return new Set(
    db.prepare("SELECT type FROM chest_type_slots WHERE user_id = ?").all(userId).map((r) => r.type),
  );
}

function heldChestCounts(userId) {
  const counts = {};
  for (const row of db.prepare("SELECT type, COUNT(*) AS n FROM chests WHERE user_id = ? GROUP BY type").all(userId)) {
    counts[row.type] = row.n;
  }
  return counts;
}

/**
 * How many chests spill past the dedicated slots and therefore need the free
 * universal one. Filling each dedicated slot with its own type first is always
 * optimal — a dedicated slot can hold nothing else — so this greedy count is
 * exact, not an approximation.
 */
function universalSlotsUsed(held, dedicated) {
  let overflow = 0;
  for (const type of Object.keys(CHEST_TYPES)) {
    overflow += Math.max(0, (held[type] ?? 0) - (dedicated.has(type) ? 1 : 0));
  }
  return overflow;
}

/** Is there room for one more chest of this type right now? */
function canStoreChest(type, held, dedicated) {
  const next = { ...held, [type]: (held[type] ?? 0) + 1 };
  return universalSlotsUsed(next, dedicated) <= FREE_CHEST_SLOTS;
}

function rollDiamonds({ min, max, step }) {
  const steps = Math.floor((max - min) / step) + 1;
  return min + Math.floor(Math.random() * steps) * step;
}

// Draw a random card of a given rarity out of the shared pool and remove that
// copy, so cards won from chests really do leave circulation. Returns null when
// the pool has none of that rarity left.
const drawCardOfRarityTx = db.transaction((rarity) => {
  const row = db
    .prepare("SELECT card_id FROM card_pool WHERE rarity = ? AND copies_remaining > 0 ORDER BY RANDOM() LIMIT 1")
    .get(rarity);
  if (!row) return null;
  stmtDecrementCard.run(row.card_id);
  return row.card_id;
});

function publicChest(row, slot) {
  const config = CHEST_TYPES[row.type];
  return {
    id: row.id,
    type: row.type,
    label: config?.label ?? row.type,
    boughtAt: row.bought_at,
    readyAt: row.ready_at,
    ready: Date.parse(row.ready_at) <= Date.now(),
    /** Which slot it occupies: its own chest type, or "free" for the universal one. */
    slot,
  };
}

function buildChestsResponse(userId) {
  const rows = db
    .prepare("SELECT * FROM chests WHERE user_id = ? ORDER BY ready_at ASC")
    .all(userId);
  const dedicated = dedicatedSlotsFor(userId);
  const held = heldChestCounts(userId);

  // Assign each chest to a slot for display, dedicated first — the same greedy
  // rule the capacity check uses, so what the player sees matches what the
  // server will allow.
  const dedicatedTaken = new Set();
  const chests = rows.map((row) => {
    if (dedicated.has(row.type) && !dedicatedTaken.has(row.type)) {
      dedicatedTaken.add(row.type);
      return publicChest(row, row.type);
    }
    return publicChest(row, "free");
  });

  return {
    chests,
    slots: FREE_CHEST_SLOTS + dedicated.size,
    maxSlots: MAX_CHEST_SLOTS,
    freeSlots: FREE_CHEST_SLOTS,
    /** One entry per buyable dedicated slot, whether owned yet or not. */
    slotTypes: Object.values(CHEST_TYPES).map((c) => ({
      type: c.id,
      label: c.label,
      slotLabel: CHEST_SLOT_LABELS[c.id].slot,
      price: CHEST_SLOT_PRICES[c.id],
      owned: dedicated.has(c.id),
    })),
    /** Server-computed room check per type, so the UI never re-derives the rule. */
    canStore: Object.fromEntries(
      Object.keys(CHEST_TYPES).map((type) => [type, canStoreChest(type, held, dedicated)]),
    ),
    types: Object.values(CHEST_TYPES).map((c) => ({
      id: c.id,
      label: c.label,
      price: c.price,
      waitHours: c.waitMs / HOUR_MS,
      diamondMin: c.diamonds.min,
      diamondMax: c.diamonds.max,
    })),
  };
}

app.get("/api/game/chests", authed, (request, response) => {
  response.json(buildChestsResponse(request.auth.userId));
});

app.post("/api/game/chests/buy", authed, (request, response) => {
  const userId = request.auth.userId;
  const config = CHEST_TYPES[String(request.body?.type ?? "")];
  if (!config) {
    response.status(400).json({ message: "Okänd kista." });
    return;
  }

  ensurePlayerState(userId);

  try {
    db.transaction(() => {
      const dedicated = dedicatedSlotsFor(userId);
      if (!canStoreChest(config.id, heldChestCounts(userId), dedicated)) {
        const words = CHEST_SLOT_LABELS[config.id];
        throw new Error(
          dedicated.has(config.id)
            ? `Din ${words.slot} och den fria platsen är upptagna. Öppna en kista först.`
            : `Ingen ledig plats för fler ${words.plural}. Öppna en kista, eller köp en fast ${words.slot} i Samling.`,
        );
      }

      const { diamonds } = db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(userId);
      if (diamonds < config.price) throw new Error("Inte tillräckligt med diamanter.");

      const now = Date.now();
      db.prepare("UPDATE player_state SET diamonds = diamonds - ? WHERE user_id = ?").run(config.price, userId);
      db.prepare("INSERT INTO chests (id, user_id, type, bought_at, ready_at) VALUES (?, ?, ?, ?, ?)").run(
        crypto.randomUUID(),
        userId,
        config.id,
        new Date(now).toISOString(),
        new Date(now + config.waitMs).toISOString(),
      );
    })();
  } catch (err) {
    response.status(400).json({ message: err.message });
    return;
  }

  response.status(201).json({ ...buildChestsResponse(userId), state: buildStateResponse(userId) });
});

// Buy the dedicated slot for one chest type. Each type can be bought once, in
// any order, and is permanent.
app.post("/api/game/chests/buy-slot", authed, (request, response) => {
  const userId = request.auth.userId;
  const type = String(request.body?.type ?? "");
  const config = CHEST_TYPES[type];
  const price = CHEST_SLOT_PRICES[type];

  if (!config || !price) {
    response.status(400).json({ message: "Okänd kistplats." });
    return;
  }

  ensurePlayerState(userId);

  try {
    db.transaction(() => {
      if (dedicatedSlotsFor(userId).has(type)) {
        throw new Error(`Du har redan en ${CHEST_SLOT_LABELS[type].slot}.`);
      }

      const { diamonds } = db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(userId);
      if (diamonds < price) throw new Error("Inte tillräckligt med diamanter.");

      db.prepare("UPDATE player_state SET diamonds = diamonds - ? WHERE user_id = ?").run(price, userId);
      db.prepare("INSERT INTO chest_type_slots (user_id, type, bought_at) VALUES (?, ?, ?)").run(
        userId,
        type,
        new Date().toISOString(),
      );
    })();
  } catch (err) {
    response.status(400).json({ message: err.message });
    return;
  }

  response.json({ ...buildChestsResponse(userId), state: buildStateResponse(userId) });
});

app.post("/api/game/chests/:id/collect", authed, (request, response) => {
  const userId = request.auth.userId;
  const chest = db.prepare("SELECT * FROM chests WHERE id = ?").get(request.params.id);

  if (!chest || chest.user_id !== userId) {
    response.status(404).json({ message: "Kistan hittades inte." });
    return;
  }
  if (Date.parse(chest.ready_at) > Date.now()) {
    response.status(400).json({ message: "Kistan är inte redo att öppnas än." });
    return;
  }

  const config = CHEST_TYPES[chest.type];
  if (!config) {
    response.status(400).json({ message: "Okänd kista." });
    return;
  }

  const diamondsAwarded = rollDiamonds(config.diamonds);
  let wonCardIds = [];

  try {
    // One transaction so a concurrent double-submit can't pay out twice or
    // burn pool copies for a chest that was already opened.
    db.transaction(() => {
      const info = db.prepare("DELETE FROM chests WHERE id = ? AND user_id = ?").run(chest.id, userId);
      if (info.changes === 0) throw new Error("Kistan är redan öppnad.");

      wonCardIds = [];
      for (const roll of config.cardRolls) {
        if (Math.random() >= roll.chance) continue;
        const cardId = drawCardOfRarityTx(roll.rarity);
        if (cardId) wonCardIds.push(cardId);
      }

      db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(diamondsAwarded, userId);
      const stmtInsertCard = db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)");
      for (const cardId of wonCardIds) stmtInsertCard.run(userId, cardId);
    })();
  } catch (err) {
    response.status(409).json({ message: err.message });
    return;
  }

  response.json({
    chestType: chest.type,
    chestLabel: config.label,
    diamondsAwarded,
    cards: wonCardIds.map((id) => cardById.get(id)).filter(Boolean),
    ...buildChestsResponse(userId),
    state: buildStateResponse(userId),
  });
});

// ── Trade history cleanup ───────────────────────────────────────────────────────

const TRADE_HISTORY_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 dagar
const TRADE_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // varje dygn

function clearOldTradeHistory() {
  const cutoff = new Date(Date.now() - TRADE_HISTORY_MAX_AGE_MS).toISOString();
  db.prepare(
    "DELETE FROM trades WHERE status != 'pending' AND created_at < ?",
  ).run(cutoff);
}

clearOldTradeHistory();
setInterval(clearOldTradeHistory, TRADE_CLEANUP_INTERVAL_MS);

// ── Admin routes ──────────────────────────────────────────────────────────────

app.post("/api/admin/login", (request, response) => {
  if (!ADMIN_PASSWORD) {
    response.status(503).json({ message: "Admin är inte konfigurerad på servern." });
    return;
  }
  const password = String(request.body?.password ?? "");
  if (password !== ADMIN_PASSWORD) {
    response.status(401).json({ message: "Fel lösenord." });
    return;
  }
  setAdminCookie(response);
  response.json({ ok: true });
});

app.post("/api/admin/logout", (_request, response) => {
  clearAdminCookie(response);
  response.status(204).send();
});

app.get("/api/admin/me", requireAdmin, (_request, response) => {
  response.json({ ok: true });
});

// card_pool can retain rows from earlier catalog versions; scope admin views to
// the cards currently in the live catalog so the numbers stay meaningful.
function livePoolRows() {
  return db
    .prepare("SELECT card_id, collection_id, rarity, total_copies, copies_remaining FROM card_pool")
    .all()
    .filter((r) => cardById.has(r.card_id));
}

app.get("/api/admin/overview", requireAdmin, (_request, response) => {
  const userCount = db.prepare("SELECT COUNT(*) AS n FROM users").get().n;
  const byRarity = {};
  let totalCards = 0;
  let totalRemaining = 0;
  for (const r of livePoolRows()) {
    const stat = byRarity[r.rarity] ?? { total: 0, remaining: 0, bought: 0 };
    stat.total += r.total_copies;
    stat.remaining += r.copies_remaining;
    stat.bought += r.total_copies - r.copies_remaining;
    byRarity[r.rarity] = stat;
    totalCards += r.total_copies;
    totalRemaining += r.copies_remaining;
  }
  const totalOwned = db.prepare("SELECT COUNT(*) AS n FROM owned_cards").get().n;
  response.json({
    userCount,
    totalOwnedCards: totalOwned,
    pool: { byRarity, totalCards, totalRemaining, totalBought: totalCards - totalRemaining },
  });
});

app.get("/api/admin/users", requireAdmin, (_request, response) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.created_at, u.first_name, u.last_name,
           COALESCE(ps.diamonds, 0) AS diamonds,
           (SELECT COUNT(*) FROM owned_cards oc WHERE oc.user_id = u.id) AS total_cards,
           (SELECT COUNT(DISTINCT oc.card_id) FROM owned_cards oc WHERE oc.user_id = u.id) AS unique_cards
    FROM users u
    LEFT JOIN player_state ps ON ps.user_id = u.id
    ORDER BY u.created_at ASC
  `).all();
  response.json(rows.map((r) => ({
    id: r.id,
    username: r.username,
    email: r.email,
    firstName: r.first_name ?? null,
    lastName: r.last_name ?? null,
    createdAt: r.created_at,
    diamonds: r.diamonds,
    totalCards: r.total_cards,
    uniqueCards: r.unique_cards,
  })));
});

// Everything about one player in a single call: account, balance, collection,
// chests, achievements, trade history and who they trade with. One round trip
// rather than six, because the whole point is scanning a player at a glance.
app.get("/api/admin/users/:id", requireAdmin, (request, response) => {
  const userId = request.params.id;
  const user = db
    .prepare("SELECT id, username, email, created_at, first_name, last_name FROM users WHERE id = ?")
    .get(userId);
  if (!user) { response.status(404).json({ message: "Användaren hittades inte." }); return; }

  const state = db.prepare("SELECT * FROM player_state WHERE user_id = ?").get(userId);

  const ownedRows = db
    .prepare("SELECT card_id, COUNT(*) AS count FROM owned_cards WHERE user_id = ? GROUP BY card_id")
    .all(userId);
  const markedForTrade = new Map(
    db.prepare("SELECT card_id, quantity FROM cards_for_trade WHERE user_id = ?").all(userId)
      .map((r) => [r.card_id, r.quantity]),
  );

  const rarityCounts = {};
  let totalCards = 0;
  for (const row of ownedRows) {
    const rarity = cardById.get(row.card_id)?.rarity ?? "unknown";
    rarityCounts[rarity] = (rarityCounts[rarity] ?? 0) + row.count;
    totalCards += row.count;
  }

  const chestRows = db
    .prepare("SELECT * FROM chests WHERE user_id = ? ORDER BY ready_at ASC")
    .all(userId);
  const dedicatedSlots = dedicatedSlotsFor(userId);

  const claimedRows = db
    .prepare("SELECT achievement_id, claimed_at FROM achievement_claims WHERE user_id = ? ORDER BY claimed_at DESC")
    .all(userId);

  // Trades this player is party to, valued with the same model as the
  // trade-integrity report so the numbers agree between the two views.
  const exclusive = exclusivePairKeys();
  const tradeRows = stmtAdminTrades.all()
    .filter((r) => r.sender_user_id === userId || r.receiver_user_id === userId);

  const trades = tradeRows.map((row) => {
    const analysis = analyzeTrade(row);
    const isSender = row.sender_user_id === userId;
    const flags = [...analysis.flags];
    if (exclusive.has(pairKey(row.sender_user_id, row.receiver_user_id))) flags.push("exclusive_pair");
    return {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
      direction: isSender ? "sent" : "received",
      counterparty: isSender
        ? { id: row.receiver_user_id, username: row.receiver_username }
        : { id: row.sender_user_id, username: row.sender_username },
      // Always from this player's point of view: what they hand over vs receive.
      givesCardIds: isSender ? analysis.offeredCardIds : analysis.requestedCardIds,
      givesDiamonds: isSender ? row.offered_diamonds : row.requested_diamonds,
      getsCardIds: isSender ? analysis.requestedCardIds : analysis.offeredCardIds,
      getsDiamonds: isSender ? row.requested_diamonds : row.offered_diamonds,
      givesValue: isSender ? analysis.senderValue : analysis.receiverValue,
      getsValue: isSender ? analysis.receiverValue : analysis.senderValue,
      netValue: isSender ? analysis.senderNet : -analysis.senderNet,
      ratio: analysis.ratio,
      isCounter: row.counter_of_trade_id !== null,
      flags,
    };
  });

  // Who they actually complete trades with, and which way the value ran.
  const partners = new Map();
  for (const trade of trades) {
    if (trade.status !== "accepted") continue;
    const entry = partners.get(trade.counterparty.id) ?? {
      id: trade.counterparty.id, username: trade.counterparty.username,
      acceptedTrades: 0, netValue: 0, flaggedTrades: 0,
    };
    entry.acceptedTrades += 1;
    entry.netValue += trade.netValue;
    if (trade.flags.some((f) => f !== "exclusive_pair")) entry.flaggedTrades += 1;
    partners.set(trade.counterparty.id, entry);
  }

  response.json({
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.first_name ?? null,
      lastName: user.last_name ?? null,
      createdAt: user.created_at,
    },
    state: {
      diamonds: state?.diamonds ?? 0,
      lastDailyClaimDate: state?.last_daily_claim_date ?? null,
      canClaimDailyDiamonds: (state?.last_daily_claim_date ?? null) !== todayIso(),
    },
    totals: {
      totalCards,
      uniqueCards: ownedRows.length,
      markedForTrade: [...markedForTrade.values()].reduce((sum, n) => sum + n, 0),
      chests: chestRows.length,
      chestSlots: FREE_CHEST_SLOTS + dedicatedSlots.size,
      // Which dedicated slots they have bought, in a stable order.
      chestSlotTypes: Object.keys(CHEST_TYPES).filter((t) => dedicatedSlots.has(t)),
      achievementsClaimed: claimedRows.length,
      achievementsTotal: achievementDefinitions.length,
      trades: trades.length,
      tradesAccepted: trades.filter((t) => t.status === "accepted").length,
    },
    rarityCounts,
    cards: ownedRows.map((r) => ({
      cardId: r.card_id,
      count: r.count,
      // Capped at what they actually own, same rule the trade routes apply.
      markedForTrade: Math.min(markedForTrade.get(r.card_id) ?? 0, r.count),
    })),
    chests: chestRows.map((row) => publicChest(row, dedicatedSlots.has(row.type) ? row.type : "free")),
    achievements: claimedRows.map((r) => ({
      id: r.achievement_id,
      title: achievementById.get(r.achievement_id)?.title ?? r.achievement_id,
      reward: achievementById.get(r.achievement_id)?.reward ?? null,
      claimedAt: r.claimed_at,
    })),
    trades,
    partners: [...partners.values()].sort((a, b) => b.acceptedTrades - a.acceptedTrades),
  });
});

app.get("/api/admin/pool", requireAdmin, (_request, response) => {
  response.json(livePoolRows().map((r) => ({
    cardId: r.card_id,
    collectionId: r.collection_id,
    rarity: r.rarity,
    total: r.total_copies,
    remaining: r.copies_remaining,
    bought: r.total_copies - r.copies_remaining,
  })));
});

// Deletes a player entirely: their account, diamonds, owned cards, chests,
// trade listings, pending trades (as either party), achievement claims and
// password-reset tokens. Owned cards are handed back to card_pool.copies_remaining
// (same convention as the upgrade route) so they go back into circulation for
// other players rather than vanishing from the pool's accounting. Only this
// user's own rows are touched — trades are deleted outright rather than
// completed, so nothing is transferred to or taken from the other party.
app.delete("/api/admin/users/:id", requireAdmin, (request, response) => {
  const userId = request.params.id;
  const user = db.prepare("SELECT id FROM users WHERE id = ?").get(userId);
  if (!user) { response.status(404).json({ message: "Användaren hittades inte." }); return; }

  db.transaction(() => {
    const stmtReturnToPool = db.prepare("UPDATE card_pool SET copies_remaining = copies_remaining + 1 WHERE card_id = ?");
    for (const row of db.prepare("SELECT card_id FROM owned_cards WHERE user_id = ?").all(userId)) {
      stmtReturnToPool.run(row.card_id);
    }

    db.prepare("DELETE FROM owned_cards WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM cards_for_trade WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM chests WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM chest_slots WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM chest_type_slots WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM achievement_claims WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM trades WHERE sender_user_id = ? OR receiver_user_id = ?").run(userId, userId);
    db.prepare("DELETE FROM player_state WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM users WHERE id = ?").run(userId);
  })();

  response.status(204).send();
});

// ── Admin: trade integrity ────────────────────────────────────────────────────
// Two reports aimed at the same problem: one person running several accounts to
// double their pack income and funnel cards to a main. Neither proves anything on
// its own — they surface pairs and trades worth a human look.

const stmtAdminTrades = db.prepare(`
  SELECT t.*,
         su.username AS sender_username, su.email AS sender_email, su.created_at AS sender_created_at,
         ru.username AS receiver_username, ru.email AS receiver_email, ru.created_at AS receiver_created_at
  FROM trades t
  JOIN users su ON su.id = t.sender_user_id
  JOIN users ru ON ru.id = t.receiver_user_id
  ORDER BY t.created_at DESC
`);

// Every trade, newest first, valued on both sides and flagged when heavily
// one-sided. Returned whole rather than pre-filtered so the admin page can show
// "all" and "flagged only" without a second round trip — this table is small.
app.get("/api/admin/trades", requireAdmin, (_request, response) => {
  const rows = stmtAdminTrades.all();
  const exclusive = exclusivePairKeys();

  response.json(
    rows.map((row) => {
      const analysis = analyzeTrade(row);
      const flags = [...analysis.flags];
      if (exclusive.has(pairKey(row.sender_user_id, row.receiver_user_id))) {
        flags.push("exclusive_pair");
      }
      return {
        id: row.id,
        status: row.status,
        createdAt: row.created_at,
        sender: { id: row.sender_user_id, username: row.sender_username },
        receiver: { id: row.receiver_user_id, username: row.receiver_username },
        offeredCardIds: analysis.offeredCardIds,
        offeredDiamonds: row.offered_diamonds,
        requestedCardIds: analysis.requestedCardIds,
        requestedDiamonds: row.requested_diamonds,
        senderValue: analysis.senderValue,
        receiverValue: analysis.receiverValue,
        senderNet: analysis.senderNet,
        ratio: analysis.ratio,
        favours: analysis.favours,
        flags,
      };
    }),
  );
});

function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

// Builds the accepted-trade graph: who has actually exchanged value with whom.
// Pending and rejected trades move nothing, so they would only add noise here.
function acceptedTradeGraph() {
  const rows = stmtAdminTrades.all().filter((r) => r.status === "accepted");
  const partners = new Map(); // userId -> Set of counterparty ids
  const tradeCount = new Map(); // userId -> accepted trades, any counterparty

  for (const row of rows) {
    const { sender_user_id: a, receiver_user_id: b } = row;
    if (!partners.has(a)) partners.set(a, new Set());
    if (!partners.has(b)) partners.set(b, new Set());
    partners.get(a).add(b);
    partners.get(b).add(a);
    tradeCount.set(a, (tradeCount.get(a) ?? 0) + 1);
    tradeCount.set(b, (tradeCount.get(b) ?? 0) + 1);
  }

  return { rows, partners, tradeCount };
}

// Pairs where neither account has ever traded with anyone else — the shape a
// self-trading account farm makes.
function exclusivePairKeys() {
  const { partners } = acceptedTradeGraph();
  const keys = new Set();
  for (const [userId, set] of partners) {
    if (set.size !== 1) continue;
    const [other] = set;
    if (partners.get(other)?.size === 1) keys.add(pairKey(userId, other));
  }
  return keys;
}

function minutesBetween(isoA, isoB) {
  const a = Date.parse(isoA);
  const b = Date.parse(isoB);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round(Math.abs(a - b) / 60000);
}

// Every pair that has completed at least one trade, ranked by how much they look
// like one person trading with themselves. Computed on request rather than by a
// nightly job: the trades table is small enough that this is a few milliseconds,
// and an on-demand report can never be stale or silently stop running.
app.get("/api/admin/trade-pairs", requireAdmin, (_request, response) => {
  const { rows, partners, tradeCount } = acceptedTradeGraph();
  const pairs = new Map();

  for (const row of rows) {
    const key = pairKey(row.sender_user_id, row.receiver_user_id);
    // userA is whichever id sorts first, so netValueToA has a stable direction
    // no matter who happened to open any individual trade.
    const aIsSender = row.sender_user_id < row.receiver_user_id;
    let pair = pairs.get(key);
    if (!pair) {
      const sender = {
        id: row.sender_user_id, username: row.sender_username,
        email: row.sender_email, createdAt: row.sender_created_at,
      };
      const receiver = {
        id: row.receiver_user_id, username: row.receiver_username,
        email: row.receiver_email, createdAt: row.receiver_created_at,
      };
      pair = {
        key,
        userA: aIsSender ? sender : receiver,
        userB: aIsSender ? receiver : sender,
        tradeCount: 0,
        lopsidedCount: 0,
        netValueToA: 0,
        firstTradeAt: row.created_at,
        lastTradeAt: row.created_at,
      };
      pairs.set(key, pair);
    }

    const analysis = analyzeTrade(row);
    pair.tradeCount += 1;
    if (analysis.flags.length > 0) pair.lopsidedCount += 1;
    // senderNet is what the sender gained; flip it when the sender is userB.
    pair.netValueToA += aIsSender ? analysis.senderNet : -analysis.senderNet;
    if (row.created_at < pair.firstTradeAt) pair.firstTradeAt = row.created_at;
    if (row.created_at > pair.lastTradeAt) pair.lastTradeAt = row.created_at;
  }

  const result = [...pairs.values()].map((pair) => {
    const partnersA = partners.get(pair.userA.id)?.size ?? 0;
    const partnersB = partners.get(pair.userB.id)?.size ?? 0;
    // What share of each account's trading life is spent on this one partner.
    // An alt-account farmer who makes a couple of real trades to look legitimate
    // still scores high here, where a strict exclusivity test would clear them.
    const shareA = pair.tradeCount / (tradeCount.get(pair.userA.id) || 1);
    const shareB = pair.tradeCount / (tradeCount.get(pair.userB.id) || 1);
    const signupGapMinutes = minutesBetween(pair.userA.createdAt, pair.userB.createdAt);

    return {
      ...pair,
      netValueToA: round1(pair.netValueToA),
      partnersA,
      partnersB,
      exclusive: partnersA === 1 && partnersB === 1,
      concentration: round1(Math.min(shareA, shareB) * 100),
      signupGapMinutes,
      registeredTogether:
        signupGapMinutes !== null && signupGapMinutes <= SAME_SIGNUP_WINDOW_MINUTES,
    };
  });

  // Most suspicious first: exclusive pairs, then the most concentrated, then the
  // busiest.
  result.sort(
    (a, b) =>
      Number(b.exclusive) - Number(a.exclusive) ||
      b.concentration - a.concentration ||
      b.tradeCount - a.tradeCount,
  );

  response.json(result);
});

const ANNOUNCEMENT_TITLE_MAX = 80;
const ANNOUNCEMENT_BODY_MAX = 1000;

app.get("/api/admin/announcements", requireAdmin, (_request, response) => {
  const rows = db.prepare("SELECT id, title, body, created_at FROM announcements ORDER BY created_at DESC").all();
  response.json(rows.map((r) => ({ id: r.id, title: r.title, body: r.body, createdAt: r.created_at })));
});

app.post("/api/admin/announcements", requireAdmin, (request, response) => {
  const title = String(request.body?.title ?? "").trim();
  const body = String(request.body?.body ?? "").trim();

  if (!title || !body) {
    response.status(400).json({ message: "Rubrik och text krävs." });
    return;
  }
  if (title.length > ANNOUNCEMENT_TITLE_MAX) {
    response.status(400).json({ message: `Rubriken får vara högst ${ANNOUNCEMENT_TITLE_MAX} tecken.` });
    return;
  }
  if (body.length > ANNOUNCEMENT_BODY_MAX) {
    response.status(400).json({ message: `Texten får vara högst ${ANNOUNCEMENT_BODY_MAX} tecken.` });
    return;
  }

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare("INSERT INTO announcements (id, title, body, created_at) VALUES (?, ?, ?, ?)").run(
    id, title, body, createdAt,
  );

  response.status(201).json({ id, title, body, createdAt });
});

app.delete("/api/admin/announcements/:id", requireAdmin, (request, response) => {
  const result = db.prepare("DELETE FROM announcements WHERE id = ?").run(request.params.id);
  if (result.changes === 0) {
    response.status(404).json({ message: "Meddelandet hittades inte." });
    return;
  }
  response.status(204).send();
});

// ── Static frontend (production) ────────────────────────────────────────────────
// Serve the built SPA. Registered after all /api routes so API 404s aren't
// swallowed by the catch-all fallback. The regex matches any path NOT under /api/.

const distPath = path.join(__dirname, "..", "dist");
app.use(express.static(distPath));
app.get(/^(?!\/api\/).*/, (_request, response) => {
  response.sendFile(path.join(distPath, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
