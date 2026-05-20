import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { loadGameCatalog } from "./gameCatalog.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const usersFilePath = path.join(workspaceRoot, "data", "users.json");
const playerStateFilePath = path.join(workspaceRoot, "data", "player-state.json");
const gameContentFilePath = path.join(workspaceRoot, "data", "game-content.json");

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

async function ensureUsersFile() {
  const directory = path.dirname(usersFilePath);
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.access(usersFilePath);
  } catch {
    await fs.writeFile(usersFilePath, "[]", "utf8");
  }
}

async function readUsers() {
  await ensureUsersFile();
  const raw = await fs.readFile(usersFilePath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    await fs.writeFile(usersFilePath, "[]", "utf8");
    return [];
  }
}

async function writeUsers(users) {
  await ensureUsersFile();
  await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), "utf8");
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    createdAt: user.createdAt,
  };
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
  response.clearCookie(TOKEN_COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    secure: false,
  });
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

  const users = await readUsers();
  const emailExists = users.some((user) => user.email === email);
  if (emailExists) {
    response.status(409).json({ message: "An account with that email already exists." });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const nowIso = new Date().toISOString();
  const user = {
    id: crypto.randomUUID(),
    username,
    email,
    passwordHash,
    createdAt: nowIso,
  };

  users.push(user);
  await writeUsers(users);

  const sessionPayload = { userId: user.id, email: user.email };
  setAuthCookie(response, sessionPayload);
  response.status(201).json({ user: publicUser(user) });
});

app.post("/api/auth/login", async (request, response) => {
  const email = String(request.body?.email ?? "").trim().toLowerCase();
  const password = String(request.body?.password ?? "");
  if (!email || !password) {
    response.status(400).json({ message: "Email and password are required." });
    return;
  }

  const users = await readUsers();
  const user = users.find((candidate) => candidate.email === email);
  if (!user) {
    response.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const validPassword = await bcrypt.compare(password, user.passwordHash);
  if (!validPassword) {
    response.status(401).json({ message: "Invalid email or password." });
    return;
  }

  const sessionPayload = { userId: user.id, email: user.email };
  setAuthCookie(response, sessionPayload);
  response.json({ user: publicUser(user) });
});

app.post("/api/auth/logout", (_request, response) => {
  clearAuthCookie(response);
  response.status(204).send();
});

app.get("/api/auth/me", requireAuth, async (request, response) => {
  const users = await readUsers();
  const user = users.find((candidate) => candidate.id === request.auth.userId);
  if (!user) {
    clearAuthCookie(response);
    response.status(401).json({ message: "Session user no longer exists." });
    return;
  }

  response.json({ user: publicUser(user) });
});

// ── Game helpers ────────────────────────────────────────────────────────────

async function readPlayerState() {
  try {
    const raw = await fs.readFile(playerStateFilePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writePlayerState(state) {
  await fs.writeFile(playerStateFilePath, JSON.stringify(state, null, 2), "utf8");
}

function getOrInitUserState(allState, userId) {
  if (!allState[userId]) {
    allState[userId] = {
      ownedCardIds: [],
      diamonds: 0,
      lastDailyClaimDate: null,
      lastOpenedCards: [],
    };
    return allState[userId];
  }

  const s = allState[userId];

  // Migration: rename lastClaimDate → lastDailyClaimDate
  if (s.lastClaimDate !== undefined && s.lastDailyClaimDate === undefined) {
    s.lastDailyClaimDate = s.lastClaimDate;
    delete s.lastClaimDate;
  }
  if (s.lastDailyClaimDate === undefined) s.lastDailyClaimDate = null;
  if (typeof s.diamonds !== "number") s.diamonds = 0;
  if (!Array.isArray(s.lastOpenedCards)) s.lastOpenedCards = [];

  return s;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function buildStateResponse(userState) {
  return {
    ownedCardIds: userState.ownedCardIds,
    diamonds: userState.diamonds,
    lastDailyClaimDate: userState.lastDailyClaimDate,
    canClaimDailyDiamonds: userState.lastDailyClaimDate !== todayIso(),
    lastOpenedCards: userState.lastOpenedCards,
  };
}

function drawRarity(chances) {
  const roll = Math.random();
  let cursor = 0;
  for (const rarity of ["legendary", "epic", "rare", "common"]) {
    cursor += chances[rarity] ?? 0;
    if (roll <= cursor) return rarity;
  }
  return "common";
}

function openPackCards(packConfig, allCards) {
  const pulled = [];
  for (let i = 0; i < packConfig.cardCount; i++) {
    const rarity = drawRarity(packConfig.rarityChances);
    const pool = allCards.filter((c) => c.rarity === rarity);
    if (pool.length === 0) continue;
    pulled.push(pool[Math.floor(Math.random() * pool.length)]);
  }
  return pulled;
}

// ── Game routes ──────────────────────────────────────────────────────────────

app.get("/api/game/state", requireAuth, async (request, response) => {
  const allState = await readPlayerState();
  const userState = getOrInitUserState(allState, request.auth.userId);
  response.json(buildStateResponse(userState));
});

app.post("/api/game/claim-daily-diamonds", requireAuth, async (request, response) => {
  const gameContentRaw = await fs.readFile(gameContentFilePath, "utf8");
  const gameContent = JSON.parse(gameContentRaw);
  const reward = typeof gameContent.dailyDiamonds === "number" ? gameContent.dailyDiamonds : 150;

  const allState = await readPlayerState();
  const userState = getOrInitUserState(allState, request.auth.userId);

  if (userState.lastDailyClaimDate === todayIso()) {
    response.status(400).json({ message: "Dagliga diamanter redan hämtade." });
    return;
  }

  userState.diamonds += reward;
  userState.lastDailyClaimDate = todayIso();
  allState[request.auth.userId] = userState;
  await writePlayerState(allState);

  response.json({ diamondsAwarded: reward, state: buildStateResponse(userState) });
});

app.post("/api/game/buy-pack", requireAuth, async (request, response) => {
  const packId = String(request.body?.packId ?? "").trim();
  if (!packId) {
    response.status(400).json({ message: "packId krävs." });
    return;
  }

  const { cards: allCards, packConfigs } = await loadGameCatalog();
  const packConfig = packConfigs[packId];
  if (!packConfig) {
    response.status(400).json({ message: "Okänt pack." });
    return;
  }

  const allState = await readPlayerState();
  const userState = getOrInitUserState(allState, request.auth.userId);

  if (userState.diamonds < packConfig.price) {
    response.status(400).json({ message: "Inte tillräckligt med diamanter." });
    return;
  }

  userState.diamonds -= packConfig.price;
  const pulledCards = openPackCards(packConfig, allCards);
  for (const card of pulledCards) {
    userState.ownedCardIds.push(card.id);
  }
  userState.lastOpenedCards = pulledCards;
  allState[request.auth.userId] = userState;
  await writePlayerState(allState);

  response.json({ pulledCards, state: buildStateResponse(userState) });
});

// ── Server start ─────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`Auth API listening on http://localhost:${PORT}`);
});
