import { fileURLToPath } from "node:url";
import path from "node:path";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import db from "./db.mjs";
import { loadGameCatalog } from "./gameCatalog.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.AUTH_API_PORT ?? 4000);
const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? "dev-only-secret-change-me";
const TOKEN_COOKIE_NAME = "tcg_auth_token";
const tokenMaxAgeMs = 1000 * 60 * 60 * 24 * 7;

app.use(
  cors({
    origin: process.env.AUTH_CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// ── Pool sync ─────────────────────────────────────────────────────────────────
// Called once at startup. Adds new cards, removes stale ones, preserves state
// for cards already in the pool. Accounts for cards already owned so remaining
// copies start at total − already_distributed.

function syncCardPool(allCards, copiesPerRarity) {
  const existingPool = new Map(
    db.prepare("SELECT card_id, rarity FROM card_pool").all().map((r) => [r.card_id, r]),
  );
  const catalogIds = new Set(allCards.map((c) => c.id));

  const stmtInsert = db.prepare(
    "INSERT INTO card_pool (card_id, rarity, total_copies, copies_remaining) VALUES (?, ?, ?, ?)",
  );
  const stmtZero = db.prepare(
    "UPDATE card_pool SET copies_remaining = 0 WHERE card_id = ?",
  );
  const stmtCountOwned = db.prepare(
    "SELECT COUNT(*) as n FROM owned_cards WHERE card_id = ?",
  );

  db.transaction(() => {
    for (const card of allCards) {
      if (!existingPool.has(card.id)) {
        const total = copiesPerRarity[card.rarity] ?? 10;
        const alreadyOwned = stmtCountOwned.get(card.id).n;
        const remaining = Math.max(0, total - alreadyOwned);
        stmtInsert.run(card.id, card.rarity, total, remaining);
      }
    }
    for (const cardId of existingPool.keys()) {
      if (!catalogIds.has(cardId)) {
        stmtZero.run(cardId);
      }
    }
  })();
}

// ── Startup: load catalog once ────────────────────────────────────────────────

const { cards: allCards, packConfigs, dailyDiamonds, copiesPerRarity } = await loadGameCatalog();
const cardById = new Map(allCards.map((c) => [c.id, c]));
syncCardPool(allCards, copiesPerRarity);
console.log(`Card pool ready — ${allCards.length} cards (${allCards.filter(c => c.rarity === "legendary").length} legendary, ${allCards.filter(c => c.rarity === "epic").length} epic, ${allCards.filter(c => c.rarity === "rare").length} rare, ${allCards.filter(c => c.rarity === "common").length} common).`);

// ── Auth helpers ──────────────────────────────────────────────────────────────

function publicUser(user) {
  return { id: user.id, username: user.username, email: user.email, createdAt: user.created_at };
}

function setAuthCookie(response, payload) {
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
  response.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
    maxAge: tokenMaxAgeMs,
  });
}

function clearAuthCookie(response) {
  response.clearCookie(TOKEN_COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: false });
}

function requireAuth(request, response, next) {
  const token = request.cookies[TOKEN_COOKIE_NAME];
  if (!token) {
    response.status(401).json({ message: "Not authenticated" });
    return;
  }
  try {
    request.auth = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    clearAuthCookie(response);
    response.status(401).json({ message: "Invalid session" });
  }
}

// ── Auth routes ───────────────────────────────────────────────────────────────

app.get("/api/health", (_request, response) => {
  response.json({ ok: true });
});

app.post("/api/auth/register", async (request, response) => {
  const username = String(request.body?.username ?? "").trim();
  const email = String(request.body?.email ?? "").trim().toLowerCase();
  const password = String(request.body?.password ?? "");

  if (!username || !email || !password) {
    response.status(400).json({ message: "Username, email, and password are required." });
    return;
  }
  if (password.length < 8) {
    response.status(400).json({ message: "Password must be at least 8 characters." });
    return;
  }

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) {
    response.status(409).json({ message: "An account with that email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const nowIso = new Date().toISOString();
  const id = crypto.randomUUID();

  db.prepare(
    "INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)",
  ).run(id, username, email, passwordHash, nowIso);

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
  if (!user) {
    response.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    response.status(401).json({ message: "Invalid email or password." });
    return;
  }

  setAuthCookie(response, { userId: user.id, email: user.email });
  response.json({ user: publicUser(user) });
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

function ensurePlayerState(userId) {
  const existing = db.prepare("SELECT user_id FROM player_state WHERE user_id = ?").get(userId);
  if (!existing) {
    db.prepare(
      "INSERT INTO player_state (user_id, diamonds, last_daily_claim_date, last_opened_cards) VALUES (?, 0, NULL, '[]')",
    ).run(userId);
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

// Draw one card from the pool for the given rarity. If that rarity is exhausted,
// cascades to the next lower rarity. Returns null if nothing remains.
const stmtPickCard = db.prepare(
  "SELECT card_id FROM card_pool WHERE rarity = ? AND copies_remaining > 0 ORDER BY RANDOM() LIMIT 1",
);
const stmtDecrementCard = db.prepare(
  "UPDATE card_pool SET copies_remaining = copies_remaining - 1 WHERE card_id = ?",
);
const rarityFallback = ["legendary", "epic", "rare", "common"];

const drawCardTx = db.transaction((rarity) => {
  const startIdx = Math.max(0, rarityFallback.indexOf(rarity));
  for (let i = startIdx; i < rarityFallback.length; i++) {
    const row = stmtPickCard.get(rarityFallback[i]);
    if (!row) continue;
    stmtDecrementCard.run(row.card_id);
    return row.card_id;
  }
  return null;
});

function drawRarity(chances) {
  const roll = Math.random();
  let cursor = 0;
  for (const rarity of rarityFallback) {
    cursor += chances[rarity] ?? 0;
    if (roll <= cursor) return rarity;
  }
  return "common";
}

function openPackCards(packConfig) {
  const pulled = [];
  for (let i = 0; i < packConfig.cardCount; i++) {
    const rarity = drawRarity(packConfig.rarityChances);
    const cardId = drawCardTx(rarity);
    if (!cardId) continue;
    const card = cardById.get(cardId);
    if (card) pulled.push(card);
  }
  return pulled;
}

// ── Game routes ───────────────────────────────────────────────────────────────

app.get("/api/game/state", requireAuth, (request, response) => {
  response.json(buildStateResponse(request.auth.userId));
});

app.get("/api/game/pool", (_request, response) => {
  const rows = db
    .prepare("SELECT card_id, total_copies, copies_remaining FROM card_pool")
    .all();
  const result = {};
  for (const row of rows) {
    result[row.card_id] = {
      totalCopies: row.total_copies,
      copiesRemaining: row.copies_remaining,
    };
  }
  response.json(result);
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

app.post("/api/game/buy-pack", requireAuth, (request, response) => {
  const packId = String(request.body?.packId ?? "").trim();
  if (!packId) {
    response.status(400).json({ message: "packId krävs." });
    return;
  }

  const packConfig = packConfigs[packId];
  if (!packConfig) {
    response.status(400).json({ message: "Okänt pack." });
    return;
  }

  ensurePlayerState(request.auth.userId);
  const state = db
    .prepare("SELECT diamonds FROM player_state WHERE user_id = ?")
    .get(request.auth.userId);

  if (state.diamonds < packConfig.price) {
    response.status(400).json({ message: "Inte tillräckligt med diamanter." });
    return;
  }

  const pulledCards = openPackCards(packConfig);

  db.transaction(() => {
    db.prepare(
      "UPDATE player_state SET diamonds = diamonds - ?, last_opened_cards = ? WHERE user_id = ?",
    ).run(packConfig.price, JSON.stringify(pulledCards), request.auth.userId);
    const stmtInsertCard = db.prepare(
      "INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)",
    );
    for (const card of pulledCards) {
      stmtInsertCard.run(request.auth.userId, card.id);
    }
  })();

  response.json({ pulledCards, state: buildStateResponse(request.auth.userId) });
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
