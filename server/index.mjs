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
  return { id: user.id, username: user.username, email: user.email, createdAt: user.created_at };
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
    request.auth = jwt.verify(token, JWT_SECRET);
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

  if (!username || !email || !password) {
    response.status(400).json({ message: "Username, email, and password are required." });
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
    "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, username, email, passwordHash, new Date().toISOString());

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

// ── Game helpers ──────────────────────────────────────────────────────────────

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

const STARTING_DIAMONDS = 500;

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
  };
}

// Special cards are not obtainable from packs.
const stmtSumAvailableCopies = db.prepare(
  "SELECT COALESCE(SUM(copies_remaining), 0) AS total FROM card_pool WHERE collection_id = ? AND rarity != 'special' AND copies_remaining > 0",
);
const stmtPickWeightedCard = db.prepare(
  `SELECT card_id FROM (
     SELECT card_id, SUM(copies_remaining) OVER (ORDER BY card_id) AS cum
     FROM card_pool
     WHERE collection_id = ? AND rarity != 'special' AND copies_remaining > 0
   ) WHERE cum > ? ORDER BY cum LIMIT 1`,
);
const stmtDecrementCard = db.prepare(
  "UPDATE card_pool SET copies_remaining = copies_remaining - 1 WHERE card_id = ?",
);

// Draw one card weighted by how many copies are still in the pool, so every
// physical copy is equally likely. The odds of a rarity therefore equal that
// rarity's remaining copies divided by all remaining (non-special) copies —
// e.g. at a full pool, legendary = 25 / (25 + 120 + 550 + 19300).
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

app.get("/api/game/state", requireAuth, (request, response) => {
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

// Leaderboard — players ranked by total cards owned (all copies of common,
// rare, epic, legendary). Ties are broken by who has more legendaries, then
// epics, then rares, then commons. Special cards are not counted.
const LEADERBOARD_RARITIES = ["common", "rare", "epic", "legendary"];

app.get("/api/leaderboard", requireAuth, (_request, response) => {
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
    b.total - a.total ||
    b.legendary - a.legendary ||
    b.epic - a.epic ||
    b.rare - a.rare ||
    b.common - a.common ||
    a.username.localeCompare(b.username, "sv"),
  );

  response.json(entries.slice(0, 100).map((e, i) => ({ rank: i + 1, ...e })));
});

app.post("/api/game/claim-daily-diamonds", requireAuth, (request, response) => {
  ensurePlayerState(request.auth.userId);
  const state = db
    .prepare("SELECT last_daily_claim_date FROM player_state WHERE user_id = ?")
    .get(request.auth.userId);

  if (state.last_daily_claim_date === todayIso()) {
    response.status(400).json({ message: "Dagliga diamanter redan hämtade." });
    return;
  }

  db.prepare(
    "UPDATE player_state SET diamonds = diamonds + ?, last_daily_claim_date = ? WHERE user_id = ?",
  ).run(dailyDiamonds, todayIso(), request.auth.userId);

  response.json({ diamondsAwarded: dailyDiamonds, state: buildStateResponse(request.auth.userId) });
});

const ALLOWED_PACK_QUANTITIES = [1, 5, 10];

app.post("/api/game/buy-pack", requireAuth, (request, response) => {
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

app.post("/api/game/upgrade", requireAuth, (request, response) => {
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
    };
  });
}

app.get("/api/achievements", requireAuth, (request, response) => {
  response.json(buildAchievementsResponse(request.auth.userId));
});

app.post("/api/achievements/:id/claim", requireAuth, (request, response) => {
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

app.get("/api/users/search", requireAuth, (request, response) => {
  const q = String(request.query.q ?? "").trim();
  if (q.length < 2) { response.json([]); return; }
  const users = db
    .prepare("SELECT id, username FROM users WHERE username LIKE ? AND id != ? LIMIT 10")
    .all(`%${q}%`, request.auth.userId);
  response.json(users);
});

app.get("/api/users/:userId/cards", requireAuth, (request, response) => {
  const ownedCardIds = db
    .prepare("SELECT card_id FROM owned_cards WHERE user_id = ?")
    .all(request.params.userId)
    .map((r) => r.card_id);
  response.json({ ownedCardIds });
});

// ── Cards-for-trade routes ────────────────────────────────────────────────────

function ownedCountMap(userId) {
  const rows = db.prepare("SELECT card_id, COUNT(*) AS n FROM owned_cards WHERE user_id = ? GROUP BY card_id").all(userId);
  return new Map(rows.map((r) => [r.card_id, r.n]));
}

// Marked-for-trade cards for the current user, each capped at how many copies
// they still own.
app.get("/api/game/cards-for-trade", requireAuth, (request, response) => {
  const owned = ownedCountMap(request.auth.userId);
  const rows = db.prepare("SELECT card_id, quantity FROM cards_for_trade WHERE user_id = ?").all(request.auth.userId);
  const result = rows
    .map((r) => ({ cardId: r.card_id, quantity: Math.min(r.quantity, owned.get(r.card_id) ?? 0) }))
    .filter((r) => r.quantity > 0);
  response.json(result);
});

// Replace the user's entire marked-for-trade set with the provided quantities.
app.post("/api/game/cards-for-trade", requireAuth, (request, response) => {
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

app.get("/api/users/:userId/cards-for-trade", requireAuth, (request, response) => {
  // Only return cards that are both marked for trade AND still owned, capped at
  // the owned count.
  const owned = ownedCountMap(request.params.userId);
  const rows = db.prepare("SELECT card_id, quantity FROM cards_for_trade WHERE user_id = ?").all(request.params.userId);
  const cards = rows
    .map((r) => ({ cardId: r.card_id, quantity: Math.min(r.quantity, owned.get(r.card_id) ?? 0) }))
    .filter((r) => r.quantity > 0);
  response.json({ cards });
});

// ── Trade routes ──────────────────────────────────────────────────────────────

app.post("/api/trade", requireAuth, (request, response) => {
  const senderId = request.auth.userId;
  const {
    receiverUserId,
    offeredCardIds = [],
    offeredDiamonds = 0,
    requestedCardIds = [],
    requestedDiamonds = 0,
  } = request.body ?? {};

  if (!receiverUserId) { response.status(400).json({ message: "receiverUserId krävs." }); return; }
  if (receiverUserId === senderId) { response.status(400).json({ message: "Du kan inte handla med dig själv." }); return; }
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(receiverUserId)) {
    response.status(404).json({ message: "Mottagaren hittades inte." }); return;
  }
  if (offeredCardIds.length === 0 && offeredDiamonds === 0) {
    response.status(400).json({ message: "Du måste erbjuda minst ett kort eller diamanter." }); return;
  }
  if (requestedCardIds.length === 0 && requestedDiamonds === 0) {
    response.status(400).json({ message: "Du måste begära minst ett kort eller diamanter." }); return;
  }

  const stmtCountOwned = db.prepare("SELECT COUNT(*) AS n FROM owned_cards WHERE user_id = ? AND card_id = ?");
  for (const [cardId, need] of tallyIds(offeredCardIds)) {
    if (stmtCountOwned.get(senderId, cardId).n < need) {
      response.status(400).json({ message: "Du äger inte alla erbjudna kort." }); return;
    }
  }
  // Requested cards must be marked for trade by the receiver, in sufficient quantity.
  const receiverMarked = new Map(
    db.prepare("SELECT card_id, quantity FROM cards_for_trade WHERE user_id = ?").all(receiverUserId).map((r) => [r.card_id, r.quantity]),
  );
  for (const [cardId, need] of tallyIds(requestedCardIds)) {
    const available = Math.min(receiverMarked.get(cardId) ?? 0, stmtCountOwned.get(receiverUserId, cardId).n);
    if (available < need) {
      response.status(400).json({ message: "Mottagaren erbjuder inte så många av ett begärt kort." }); return;
    }
  }

  if (offeredDiamonds > 0) {
    ensurePlayerState(senderId);
    const ps = db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(senderId);
    if (ps.diamonds < offeredDiamonds) {
      response.status(400).json({ message: "Inte tillräckligt med diamanter." }); return;
    }
  }

  const id = crypto.randomUUID();
  db.prepare(
    "INSERT INTO trades (id, sender_user_id, receiver_user_id, offered_card_ids, offered_diamonds, requested_card_ids, requested_diamonds, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)",
  ).run(id, senderId, receiverUserId, JSON.stringify(offeredCardIds), offeredDiamonds, JSON.stringify(requestedCardIds), requestedDiamonds, new Date().toISOString());

  response.status(201).json({ tradeId: id });
});

app.get("/api/trade", requireAuth, (request, response) => {
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

app.post("/api/trade/:id/accept", requireAuth, (request, response) => {
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

app.post("/api/trade/:id/reject", requireAuth, (request, response) => {
  const userId = request.auth.userId;
  const row = db.prepare("SELECT * FROM trades WHERE id = ?").get(request.params.id);
  if (!row || row.receiver_user_id !== userId) { response.status(403).json({ message: "Inte behörig." }); return; }
  if (row.status !== "pending") { response.status(400).json({ message: "Handeln är inte längre aktiv." }); return; }
  db.prepare("UPDATE trades SET status = 'rejected' WHERE id = ?").run(row.id);
  response.status(204).send();
});

app.post("/api/trade/:id/cancel", requireAuth, (request, response) => {
  const userId = request.auth.userId;
  const row = db.prepare("SELECT * FROM trades WHERE id = ?").get(request.params.id);
  if (!row || row.sender_user_id !== userId) { response.status(403).json({ message: "Inte behörig." }); return; }
  if (row.status !== "pending") { response.status(400).json({ message: "Handeln är inte längre aktiv." }); return; }
  db.prepare("UPDATE trades SET status = 'cancelled' WHERE id = ?").run(row.id);
  response.status(204).send();
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
    SELECT u.id, u.username, u.email, u.created_at,
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
    createdAt: r.created_at,
    diamonds: r.diamonds,
    totalCards: r.total_cards,
    uniqueCards: r.unique_cards,
  })));
});

app.get("/api/admin/users/:id/cards", requireAdmin, (request, response) => {
  const user = db.prepare("SELECT id, username, email FROM users WHERE id = ?").get(request.params.id);
  if (!user) { response.status(404).json({ message: "Användaren hittades inte." }); return; }
  const rows = db
    .prepare("SELECT card_id, COUNT(*) AS count FROM owned_cards WHERE user_id = ? GROUP BY card_id")
    .all(request.params.id);
  response.json({
    user: { id: user.id, username: user.username, email: user.email },
    cards: rows.map((r) => ({ cardId: r.card_id, count: r.count })),
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
