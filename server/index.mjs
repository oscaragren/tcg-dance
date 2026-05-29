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

const rarityBreakdown = ["legendary", "epic", "rare", "common"]
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
    secure: false,
    maxAge: tokenMaxAgeMs,
  });
}

function clearAuthCookie(response) {
  response.clearCookie(TOKEN_COOKIE_NAME, { httpOnly: true, sameSite: "lax", secure: false });
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
  if (password.length < 8) {
    response.status(400).json({ message: "Password must be at least 8 characters." });
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
  if (!db.prepare("SELECT user_id FROM player_state WHERE user_id = ?").get(userId)) {
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

const stmtPickAnyCard = db.prepare(
  "SELECT card_id FROM card_pool WHERE collection_id = ? AND copies_remaining > 0 ORDER BY RANDOM() LIMIT 1",
);
const stmtDecrementCard = db.prepare(
  "UPDATE card_pool SET copies_remaining = copies_remaining - 1 WHERE card_id = ?",
);

const drawCardTx = db.transaction((collectionId) => {
  const row = stmtPickAnyCard.get(collectionId);
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

  ensurePlayerState(request.auth.userId);
  const state = db
    .prepare("SELECT diamonds FROM player_state WHERE user_id = ?")
    .get(request.auth.userId);

  if (state.diamonds < collection.pack.price) {
    response.status(400).json({ message: "Inte tillräckligt med diamanter." });
    return;
  }

  const pulledCards = openPackCards(collection.pack, collectionId);

  db.transaction(() => {
    db.prepare(
      "UPDATE player_state SET diamonds = diamonds - ?, last_opened_cards = ? WHERE user_id = ?",
    ).run(collection.pack.price, JSON.stringify(pulledCards), request.auth.userId);
    const stmtInsertCard = db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)");
    for (const card of pulledCards) stmtInsertCard.run(request.auth.userId, card.id);
  })();

  response.json({ pulledCards, state: buildStateResponse(request.auth.userId) });
});

// ── Trade helpers ─────────────────────────────────────────────────────────────

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

app.get("/api/game/cards-for-trade", requireAuth, (request, response) => {
  const cardIds = db
    .prepare("SELECT card_id FROM cards_for_trade WHERE user_id = ?")
    .all(request.auth.userId)
    .map((r) => r.card_id);
  response.json(cardIds);
});

app.post("/api/game/toggle-card-for-trade", requireAuth, (request, response) => {
  const userId = request.auth.userId;
  const cardId = String(request.body?.cardId ?? "").trim();
  if (!cardId) { response.status(400).json({ message: "cardId krävs." }); return; }

  if (!db.prepare("SELECT 1 FROM owned_cards WHERE user_id = ? AND card_id = ?").get(userId, cardId)) {
    response.status(400).json({ message: "Du äger inte det kortet." }); return;
  }

  const exists = db.prepare("SELECT 1 FROM cards_for_trade WHERE user_id = ? AND card_id = ?").get(userId, cardId);
  if (exists) {
    db.prepare("DELETE FROM cards_for_trade WHERE user_id = ? AND card_id = ?").run(userId, cardId);
    response.json({ forTrade: false });
  } else {
    db.prepare("INSERT INTO cards_for_trade (user_id, card_id) VALUES (?, ?)").run(userId, cardId);
    response.json({ forTrade: true });
  }
});

app.get("/api/users/:userId/cards-for-trade", requireAuth, (request, response) => {
  // Only return cards that are both marked for trade AND still owned
  const cardIds = db.prepare(`
    SELECT cft.card_id
    FROM cards_for_trade cft
    JOIN owned_cards oc ON oc.user_id = cft.user_id AND oc.card_id = cft.card_id
    WHERE cft.user_id = ?
  `).all(request.params.userId).map((r) => r.card_id);
  response.json({ ownedCardIds: cardIds });
});

app.get("/api/trade/search", requireAuth, (request, response) => {
  const cardId = String(request.query.cardId ?? "").trim();
  if (!cardId) { response.json([]); return; }

  const users = db.prepare(`
    SELECT DISTINCT u.id, u.username
    FROM cards_for_trade cft
    JOIN users u ON u.id = cft.user_id
    JOIN owned_cards oc ON oc.user_id = cft.user_id AND oc.card_id = cft.card_id
    WHERE cft.card_id = ? AND cft.user_id != ?
    LIMIT 20
  `).all(cardId, request.auth.userId);
  response.json(users);
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

  for (const cardId of offeredCardIds) {
    if (!db.prepare("SELECT 1 FROM owned_cards WHERE user_id = ? AND card_id = ?").get(senderId, cardId)) {
      response.status(400).json({ message: "Du äger inte alla erbjudna kort." }); return;
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
      for (const cardId of offeredCardIds) {
        if (!db.prepare("SELECT 1 FROM owned_cards WHERE user_id = ? AND card_id = ?").get(senderId, cardId))
          throw new Error("Avsändaren äger inte längre alla erbjudna kort.");
      }
      for (const cardId of requestedCardIds) {
        if (!db.prepare("SELECT 1 FROM owned_cards WHERE user_id = ? AND card_id = ?").get(userId, cardId))
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

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
