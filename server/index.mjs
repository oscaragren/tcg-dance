import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");
const usersFilePath = path.join(workspaceRoot, "data", "users.json");
const gameStateFilePath = path.join(workspaceRoot, "data", "player-state.json");

const app = express();
const PORT = Number(process.env.AUTH_API_PORT ?? 4000);
const JWT_SECRET = process.env.AUTH_JWT_SECRET ?? "dev-only-secret-change-me";
const TOKEN_COOKIE_NAME = "tcg_auth_token";
const tokenMaxAgeMs = 1000 * 60 * 60 * 24 * 7;

const cards = [
  { id: "1", name: "Alice", rarity: "legendary" },
  { id: "2", name: "Bob", rarity: "epic" },
  { id: "3", name: "Charlie", rarity: "rare" },
  { id: "4", name: "Diana", rarity: "common" },
  { id: "5", name: "Ella", rarity: "epic" },
  { id: "6", name: "Felix", rarity: "legendary" },
  { id: "7", name: "Greta", rarity: "rare" },
  { id: "8", name: "Hugo", rarity: "common" },
  { id: "9", name: "Ida", rarity: "rare" },
  { id: "10", name: "Johan", rarity: "epic" },
  { id: "11", name: "Kajsa", rarity: "legendary" },
  { id: "12", name: "Leo", rarity: "common" },
  { id: "13", name: "Maja", rarity: "rare" },
  { id: "14", name: "Noah", rarity: "epic" },
  { id: "15", name: "Olivia", rarity: "common" },
  { id: "16", name: "Pelle", rarity: "rare" },
  { id: "17", name: "Quinn", rarity: "common" },
  { id: "18", name: "Ruben", rarity: "epic" },
  { id: "19", name: "Sara", rarity: "legendary" },
  { id: "20", name: "Ture", rarity: "rare" },
  { id: "21", name: "Ulrika", rarity: "common" },
  { id: "22", name: "Vera", rarity: "epic" },
  { id: "23", name: "William", rarity: "rare" },
  { id: "24", name: "Ylva & Zack", rarity: "legendary" },
];

const packConfigs = {
  dagspack: {
    cardCount: 5,
    rarityChances: {
      legendary: 0.03,
      epic: 0.12,
      rare: 0.3,
      common: 0.55,
    },
  },
};

app.use(
  cors({
    origin: process.env.AUTH_CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

function getTodayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getStarterCardIds() {
  const priorityOrder = ["legendary", "epic", "rare", "common"];
  const starterCards = priorityOrder.flatMap((rarity) =>
    cards.filter((card) => card.rarity === rarity).slice(0, 2),
  );
  return starterCards.map((card) => card.id);
}

function drawRarity(chances) {
  const roll = Math.random();
  let cursor = 0;
  const rarityOrder = ["legendary", "epic", "rare", "common"];

  for (const rarity of rarityOrder) {
    cursor += chances[rarity];
    if (roll <= cursor) {
      return rarity;
    }
  }

  return "common";
}

function drawCardByRarity(rarity) {
  const pool = cards.filter((card) => card.rarity === rarity);
  const randomIndex = Math.floor(Math.random() * pool.length);
  return pool[randomIndex];
}

function openPack(packType) {
  const config = packConfigs[packType];
  const pulledCards = [];

  for (let i = 0; i < config.cardCount; i += 1) {
    const rarity = drawRarity(config.rarityChances);
    pulledCards.push(drawCardByRarity(rarity));
  }

  return pulledCards;
}

async function ensureJsonFile(filePath, fallbackContent) {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, fallbackContent, "utf8");
  }
}

async function readUsers() {
  await ensureJsonFile(usersFilePath, "[]");
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
  await ensureJsonFile(usersFilePath, "[]");
  await fs.writeFile(usersFilePath, JSON.stringify(users, null, 2), "utf8");
}

async function readGameState() {
  await ensureJsonFile(gameStateFilePath, "{}");
  const raw = await fs.readFile(gameStateFilePath, "utf8");
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    await fs.writeFile(gameStateFilePath, "{}", "utf8");
    return {};
  }
}

async function writeGameState(state) {
  await ensureJsonFile(gameStateFilePath, "{}");
  await fs.writeFile(gameStateFilePath, JSON.stringify(state, null, 2), "utf8");
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

async function getOrCreatePlayerState(userId) {
  const allState = await readGameState();
  const existing = allState[userId];
  if (existing) {
    return { allState, playerState: existing };
  }

  const created = {
    ownedCardIds: getStarterCardIds(),
    lastClaimDate: null,
    lastOpenedCards: [],
  };
  allState[userId] = created;
  await writeGameState(allState);
  return { allState, playerState: created };
}

function toStateResponse(playerState) {
  return {
    ownedCardIds: playerState.ownedCardIds,
    lastClaimDate: playerState.lastClaimDate,
    canClaimDailyPack: playerState.lastClaimDate !== getTodayKey(),
    lastOpenedCards: playerState.lastOpenedCards,
  };
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

app.get("/api/game/state", requireAuth, async (request, response) => {
  const { playerState } = await getOrCreatePlayerState(request.auth.userId);
  response.json(toStateResponse(playerState));
});

app.post("/api/game/claim-daily", requireAuth, async (request, response) => {
  const today = getTodayKey();
  const { allState, playerState } = await getOrCreatePlayerState(request.auth.userId);

  if (playerState.lastClaimDate === today) {
    response.status(409).json({ message: "Daily pack already claimed today." });
    return;
  }

  const pulledCards = openPack("dagspack");
  const mergedIds = new Set([...playerState.ownedCardIds, ...pulledCards.map((card) => card.id)]);

  const updatedState = {
    ...playerState,
    ownedCardIds: Array.from(mergedIds),
    lastClaimDate: today,
    lastOpenedCards: pulledCards,
  };
  allState[request.auth.userId] = updatedState;
  await writeGameState(allState);

  response.json({
    pulledCards,
    state: toStateResponse(updatedState),
  });
});

app.listen(PORT, () => {
  console.log(`Auth API listening on http://localhost:${PORT}`);
});
