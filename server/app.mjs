import path from "node:path";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import jwt from "jsonwebtoken";
import { loadGameCatalog } from "./gameCatalog.mjs";
import { buildAchievementDefinitions, computeAchievementProgress } from "./achievements.mjs";
import { getMaintenance, setMaintenance } from "./maintenance.mjs";

/**
 * Build the game server. Everything that touches the outside world is injected:
 *   db      - an opened better-sqlite3 database (see openDatabase)
 *   clock   - { now(): number } epoch milliseconds
 *   random  - () => number in [0, 1), like Math.random
 *   mailer  - { sendPasswordResetEmail(toEmail, resetUrl), sendTopUpPendingEmail(toEmail, info) }
 *   config  - { jwtSecret, adminPassword, adminEmail, corsOrigin, appUrl, isProduction, distPath }
 *   catalog - optional pre-loaded game catalog (defaults to loadGameCatalog())
 * Returns { app, startBackgroundJobs } where startBackgroundJobs() starts the
 * recurring timers and returns a function that stops them.
 *
 * The body is deliberately not re-indented, to keep the refactor diff small.
 */
export async function createApp({ db, clock, random, mailer, config, catalog }) {
const app = express();
const IS_PRODUCTION = config.isProduction;

const JWT_SECRET = config.jwtSecret;
const TOKEN_COOKIE_NAME = "tcg_auth_token";
const tokenMaxAgeMs = 1000 * 60 * 60 * 24 * 7;

// Admin panel: gated by a single shared password (separate from user accounts).
const ADMIN_TOKEN_COOKIE_NAME = "tcg_admin_token";
const ADMIN_PASSWORD = config.adminPassword ?? "";
const adminTokenMaxAgeMs = 1000 * 60 * 60 * 24; // 1 day

app.set("trust proxy", 1);

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  }),
);
app.use(express.json());
app.use(cookieParser());

// Maintenance mode: while on, everything under /api except admin routes, the
// public status endpoint and the health check refuses with 503.
app.use("/api", (request, response, next) => {
  if (/^\/(admin(\/|$)|maintenance$|health$)/.test(request.path)) { next(); return; }
  const m = getMaintenance(db);
  if (!m.on) { next(); return; }
  response.status(503).json({ maintenance: true, message: "Vi uppdaterar", reopensAt: m.reopensAt, note: m.note });
});

// Re-check Top-ups after any request that can change the Card pool (see Top-ups below).
app.use("/api", (request, response, next) => {
  try { startDueEvents(); } catch (err) { console.error(err); }
  if (request.method !== "GET") response.on("finish", () => { try { refreshTopUps(); } catch (err) { console.error(err); } });
  next();
});

// ── Pool sync ─────────────────────────────────────────────────────────────────

// A collection may override the global copies-per-rarity (e.g. SM 21-25 has
// 230 of each common); anything it doesn't set falls back to the global value.
function copiesFor(card, copiesPerRarity, collectionsMap) {
  const own = collectionsMap.get(card.collectionId)?.copiesPerRarity;
  return own?.[card.rarity] ?? copiesPerRarity[card.rarity] ?? 10;
}

function syncCardPool(allCards, copiesPerRarity, collectionsMap) {
  const existingPool = new Map(
    db.prepare("SELECT card_id, collection_id, rarity, total_copies, bonus_copies FROM card_pool").all().map((r) => [r.card_id, r]),
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
      const existing = existingPool.get(card.id);
      // Copies added by Top-ups stay on top of the configured amount.
      const total = copiesFor(card, copiesPerRarity, collectionsMap) + (existing?.bonus_copies ?? 0);
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

const { cards: allCards, collections, dailyDiamonds, copiesPerRarity, events, chestPayouts, weeklyGoals = [], topUp: topUpConfig } = (catalog ?? (await loadGameCatalog()));
const cardById = new Map(allCards.map((c) => [c.id, c]));
const collectionsMap = new Map(collections.map((c) => [c.id, c]));
syncCardPool(allCards, copiesPerRarity, collectionsMap);

const achievementDefinitions = buildAchievementDefinitions(allCards, collections);
const achievementById = new Map(achievementDefinitions.map((a) => [a.id, a]));

const rarityBreakdown = ["special", "legendary", "epic", "rare", "common"]
  .map((r) => `${allCards.filter((c) => c.rarity === r).length} ${r}`)
  .join(", ");
console.log(`Card pool ready — ${allCards.length} cards (${rarityBreakdown}) across ${collections.length} collection(s).`);

// ── Auth helpers ──────────────────────────────────────────────────────────────

// Returns { until, reason } while the user's ban is still running, else null.
// Expired bans are simply ignored rather than cleared, so nothing has to run
// at the moment a ban ends.
function activeBan(user) {
  if (!user?.banned_until) return null;
  if (Date.parse(user.banned_until) <= clock.now()) return null;
  return { until: user.banned_until, reason: user.ban_reason ?? null };
}

function isUserBanned(userId) {
  return Boolean(activeBan(db.prepare("SELECT banned_until FROM users WHERE id = ?").get(userId)));
}

function publicUser(user) {
  const ban = activeBan(user);
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
    // Set while a ban is running. The frontend shows a countdown banner; the
    // server enforces it via requireNotBanned.
    bannedUntil: ban?.until ?? null,
    banReason: ban?.reason ?? null,
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
  ).run(id, username, email, passwordHash, new Date(clock.now()).toISOString(), firstName, lastName);

  ensurePlayerState(id);
  ensureStarterState(id);

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
    const expiresAt = new Date(clock.now() + 60 * 60 * 1000).toISOString(); // 1 h
    db.prepare(
      "INSERT INTO password_reset_tokens (token, user_id, expires_at, used) VALUES (?, ?, ?, 0)",
    ).run(token, user.id, expiresAt);

    const appUrl = config.appUrl;
    const resetUrl = `${appUrl}/aterstall-losenord?token=${token}`;
    await mailer.sendPasswordResetEmail(email, resetUrl);

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
    if (new Date(row.expires_at) < new Date(clock.now())) {
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

// A banned player keeps read-only access: every GET still works so they can
// look at their collection, the market and other players, but anything that
// changes state (packs, chests, daily diamonds, trades, achievements, "vill
// byta" marks) is refused until the ban runs out.
const BAN_ALLOWED_WRITES = new Set(["/api/announcements/seen"]);

function formatBanDate(iso) {
  return new Date(iso).toLocaleString("sv-SE", {
    timeZone: "Europe/Stockholm", dateStyle: "long", timeStyle: "short",
  });
}

function requireNotBanned(request, response, next) {
  if (request.method === "GET" || BAN_ALLOWED_WRITES.has(request.path)) { next(); return; }
  const ban = activeBan(
    db.prepare("SELECT banned_until, ban_reason FROM users WHERE id = ?").get(request.auth.userId),
  );
  if (!ban) { next(); return; }
  response.status(403).json({
    code: "BANNED",
    message: `Ditt konto är avstängt till ${formatBanDate(ban.until)}. Du kan titta men inte spela.`,
    bannedUntil: ban.until,
    reason: ban.reason,
  });
}

const authed = [requireAuth, requireCompleteProfile, requireNotBanned];

// ── Game helpers ──────────────────────────────────────────────────────────────

// Game days follow Swedish time: the daily diamonds reset at 00:00 in
// Stockholm (CET/CEST), not at 00:00 UTC. sv-SE formats dates as YYYY-MM-DD.
const stockholmDate = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Europe/Stockholm",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function todayIso() {
  return stockholmDate.format(new Date(clock.now()));
}

// ── Weekly goals (game-content.json "weeklyGoals") ───────────────────────────
// A fixed set of tasks that reset every Monday 00:00 Stockholm time. Each has a
// `kind` saying what advances it: "packsOpened" (+1 per Pack), "newCards" (+1
// per Card the player never held a Copy of before) or "tradeCompleted" (+1 per
// accepted Trade in which the player received at least one such new Card).

const weeklyGoalById = new Map(weeklyGoals.map((g) => [g.id, g]));

/** The Stockholm date (YYYY-MM-DD) of the Monday starting the current week. */
function weekStartIso() {
  const d = new Date(`${todayIso()}T12:00:00Z`); // noon UTC sidesteps DST
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

const stmtAddGoalProgress = db.prepare(
  `INSERT INTO weekly_goal_progress (user_id, week_start, goal_id, progress) VALUES (?, ?, ?, ?)
   ON CONFLICT (user_id, week_start, goal_id) DO UPDATE SET progress = progress + excluded.progress`,
);

function addWeeklyGoalProgress(userId, kind, amount = 1) {
  if (amount <= 0) return;
  const week = weekStartIso();
  for (const goal of weeklyGoals) {
    if (goal.kind === kind) stmtAddGoalProgress.run(userId, week, goal.id, amount);
  }
}

/**
 * Finishes every week that has ended: a finished goal nobody claimed is paid
 * out, and all rows of that week are dropped (the Diamond log keeps the
 * payout). Runs lazily from state reads and from a timer, so a player who
 * comes back days later still sees the payout.
 */
function settleWeeklyGoals() {
  const week = weekStartIso();
  const stale = db.prepare("SELECT * FROM weekly_goal_progress WHERE week_start < ?").all(week);
  if (stale.length === 0) return;
  db.transaction(() => {
    for (const row of stale) {
      const goal = weeklyGoalById.get(row.goal_id);
      if (goal && !row.claimed && row.progress >= goal.target) {
        ensurePlayerState(row.user_id);
        db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(goal.reward, row.user_id);
        logGameEvent(row.user_id, "weekly_goal", { diamonds: goal.reward });
      }
    }
    db.prepare("DELETE FROM weekly_goal_progress WHERE week_start < ?").run(week);
  })();
}

function buildWeeklyGoalsResponse(userId) {
  const rows = new Map(
    db.prepare("SELECT goal_id, progress, claimed FROM weekly_goal_progress WHERE user_id = ? AND week_start = ?")
      .all(userId, weekStartIso()).map((r) => [r.goal_id, r]),
  );
  return {
    weekStart: weekStartIso(),
    goals: weeklyGoals.map((g) => {
      const row = rows.get(g.id);
      const progress = Math.min(row?.progress ?? 0, g.target);
      return {
        id: g.id, title: g.title, reward: g.reward, progress, target: g.target,
        complete: progress >= g.target, claimed: Boolean(row?.claimed),
      };
    }),
  };
}

// Every Copy a player receives goes through here so the "ever held" record
// stays complete. Returns true when the Card is new to the player's Collection.
const stmtMarkEverOwned = db.prepare("INSERT OR IGNORE INTO ever_owned_cards (user_id, card_id) VALUES (?, ?)");
const stmtInsertOwned = db.prepare("INSERT INTO owned_cards (user_id, card_id) VALUES (?, ?)");
function grantCard(userId, cardId) {
  const isNew = stmtMarkEverOwned.run(userId, cardId).changes > 0;
  stmtInsertOwned.run(userId, cardId);
  return isNew;
}

// ── Time-limited Events (database, built in the admin panel) ───────────────
// An Event runs from startsAt (inclusive) to endsAt (exclusive) and may combine
// rewards: the Daily claim amount, shorter Chest waits, a Chest payout
// multiplier, a login gift and a Top-up. Events in game-content.json "events"
// are carried over once. Lifecycle: editable/deletable before it starts, only
// endable early while running, read-only once finished.

const EVENT_SOON_MS = 48 * 60 * 60 * 1000; // admin banner: "starting soon"
const EVENT_CHEST_TYPES = ["bronze", "silver", "gold"];

const iso = (ms) => new Date(ms).toISOString();

function eventFromRow(r) {
  return {
    id: r.id,
    label: r.label,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    dailyDiamonds: r.daily_diamonds,
    chestWaitHours: r.chest_wait_hours ? JSON.parse(r.chest_wait_hours) : null,
    chestMultiplier: r.chest_multiplier,
    gift: r.gift_type === "diamonds"
      ? { type: "diamonds", amount: r.gift_diamonds }
      : r.gift_type === "chest" ? { type: "chest", chestType: r.gift_chest_type } : null,
    topUpCollectionId: r.topup_collection_id,
    topUpFiredAt: r.topup_fired_at,
  };
}

function allEvents() {
  return db.prepare("SELECT * FROM events ORDER BY starts_at").all().map(eventFromRow);
}

function eventStatus(event, now = clock.now()) {
  if (now < Date.parse(event.startsAt)) return "upcoming";
  return now < Date.parse(event.endsAt) ? "running" : "finished";
}

const stmtInsertEvent = db.prepare(`
  INSERT INTO events (id, label, starts_at, ends_at, daily_diamonds, chest_wait_hours, chest_multiplier,
                      gift_type, gift_diamonds, gift_chest_type, topup_collection_id, created_at)
  VALUES (@id, @label, @startsAt, @endsAt, @dailyDiamonds, @chestWaitHours, @chestMultiplier,
          @giftType, @giftDiamonds, @giftChestType, @topUpCollectionId, @createdAt)
`);

function eventParams(id, e) {
  return {
    id,
    label: e.label,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    dailyDiamonds: e.dailyDiamonds ?? null,
    chestWaitHours: e.chestWaitHours && Object.keys(e.chestWaitHours).length ? JSON.stringify(e.chestWaitHours) : null,
    chestMultiplier: e.chestMultiplier ?? null,
    giftType: e.gift?.type ?? null,
    giftDiamonds: e.gift?.type === "diamonds" ? e.gift.amount : null,
    giftChestType: e.gift?.type === "chest" ? e.gift.chestType : null,
    topUpCollectionId: e.topUpCollectionId ?? null,
    createdAt: iso(clock.now()),
  };
}

// Carry over the content file's Events, once each.
for (const e of events) {
  if (db.prepare("INSERT OR IGNORE INTO events_seeded (id) VALUES (?)").run(e.id).changes === 0) continue;
  const startsAt = Date.parse(e.startsAt);
  const endsAt = Date.parse(e.endsAt);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) continue;
  stmtInsertEvent.run(eventParams(e.id, { ...e, startsAt: iso(startsAt), endsAt: iso(endsAt) }));
}

/** The event running at `now`, if any (first match wins). */
function activeEvent(now = clock.now()) {
  return allEvents().find((e) => eventStatus(e, now) === "running") ?? null;
}

/** What the client may show about an Event: name, end, and the active rewards. */
function publicEvent(event) {
  if (!event) return null;
  return {
    id: event.id,
    label: event.label,
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    dailyDiamonds: event.dailyDiamonds ?? null,
    chestWaitHours: event.chestWaitHours ?? null,
    chestMultiplier: event.chestMultiplier ?? null,
    gift: event.gift ?? null,
  };
}

/** Today's normal daily claim (before any streak bonus). */
function dailyDiamondsNow(now = clock.now()) {
  return activeEvent(now)?.dailyDiamonds ?? dailyDiamonds;
}

const STARTING_DIAMONDS = 500;

// The Streak is a 7-step track: every Daily claim advances it one step. A
// missed day pauses it (position unchanged), never resets it. The claim that
// reaches step 7 pays a bonus on top of that day's normal claim and the track
// goes back to step 0.
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
  settleWeeklyGoals();
  ensurePlayerState(userId);
  const state = db.prepare("SELECT * FROM player_state WHERE user_id = ?").get(userId);
  const ownedCardIds = db
    .prepare("SELECT card_id FROM owned_cards WHERE user_id = ?")
    .all(userId)
    .map((r) => r.card_id);
  const keptCardIds = db
    .prepare("SELECT card_id FROM kept_cards WHERE user_id = ?")
    .all(userId)
    .map((r) => r.card_id);

  return {
    ownedCardIds,
    keptCardIds,
    diamonds: state.diamonds,
    lastDailyClaimDate: state.last_daily_claim_date,
    canClaimDailyDiamonds: state.last_daily_claim_date !== todayIso(),
    dailyDiamondsToday: dailyDiamondsNow(),
    lastOpenedCards: JSON.parse(state.last_opened_cards),
    diamondStreak: state.diamond_streak,
    diamondStreakTarget: DIAMOND_STREAK_TARGET,
    event: publicEvent(activeEvent()),
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
  const pick = Math.floor(random() * total);
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
const UPGRADE_CARDS_REQUIRED = { common: 500, rare: 15, epic: 10 };
const TIER_UPGRADE_TARGET = { common: "rare", rare: "epic", epic: "legendary" };

// Uniform pick among the Cards of a rarity that still have Copies, using the
// injected random source (never SQLite's RANDOM()) so tests can seed it.
const stmtCountCardsOfRarity = db.prepare(
  "SELECT COUNT(*) AS n FROM card_pool WHERE collection_id = ? AND rarity = ? AND copies_remaining > 0",
);
const stmtNthCardOfRarity = db.prepare(
  "SELECT card_id FROM card_pool WHERE collection_id = ? AND rarity = ? AND copies_remaining > 0 ORDER BY card_id LIMIT 1 OFFSET ?",
);
function pickCardOfRarity(collectionId, rarity) {
  const { n } = stmtCountCardsOfRarity.get(collectionId, rarity);
  if (n === 0) return undefined;
  return stmtNthCardOfRarity.get(collectionId, rarity, Math.min(n - 1, Math.floor(random() * n)));
}

// ── Game routes ───────────────────────────────────────────────────────────────

app.get("/api/game/state", authed, (request, response) => {
  response.json(buildStateResponse(request.auth.userId));
});

// Collection progress: unique Cards owned out of all Cards, in total and per
// Rarity. Special cards are left out entirely (see GLOSSARY: Collection progress).
const PROGRESS_RARITIES = ["common", "rare", "epic", "legendary"];

app.get("/api/game/collection-progress", authed, (request, response) => {
  const collectionId = request.query.collectionId ? String(request.query.collectionId) : null;
  if (collectionId && !collectionsMap.has(collectionId)) {
    response.status(404).json({ message: "Samlingen hittades inte." });
    return;
  }
  const owned = new Set(
    db.prepare("SELECT DISTINCT card_id FROM owned_cards WHERE user_id = ?").all(request.auth.userId).map((r) => r.card_id),
  );
  const byRarity = Object.fromEntries(PROGRESS_RARITIES.map((r) => [r, { owned: 0, total: 0 }]));
  for (const card of allCards) {
    if (collectionId && card.collectionId !== collectionId) continue;
    const bucket = byRarity[card.rarity];
    if (!bucket) continue; // Special
    bucket.total += 1;
    if (owned.has(card.id)) bucket.owned += 1;
  }
  const total = { owned: 0, total: 0 };
  for (const b of Object.values(byRarity)) { total.owned += b.owned; total.total += b.total; }
  response.json({ collectionId, total, byRarity });
});

// Special cards ("Troféer") and who holds each one. Only one Copy exists, so
// there is at most one owner.
app.get("/api/game/trophies", authed, (request, response) => {
  const ownerStmt = db.prepare(
    "SELECT u.id, u.username FROM owned_cards oc JOIN users u ON u.id = oc.user_id WHERE oc.card_id = ? LIMIT 1",
  );
  response.json(
    allCards.filter((c) => c.rarity === "special").map((c) => {
      const o = ownerStmt.get(c.id);
      return {
        cardId: c.id,
        collectionId: c.collectionId,
        owner: o ? { username: o.username, isYou: o.id === request.auth.userId } : null,
      };
    }),
  );
});

// What players may know about the Card pool: whether a Collection is sold out
// and which Rarities still have Copies. Never how many (admin has /api/admin/pool).
app.get("/api/game/availability", (_request, response) => {
  const rows = db
    .prepare(
      `SELECT collection_id, rarity, SUM(copies_remaining) AS remaining
       FROM card_pool GROUP BY collection_id, rarity`,
    )
    .all();
  const result = {};
  for (const collection of collections) result[collection.id] = { soldOut: true, rarityInStock: {} };
  for (const row of rows) {
    const entry = result[row.collection_id];
    if (!entry) continue;
    const inStock = row.remaining > 0;
    entry.rarityInStock[row.rarity] = inStock;
    if (inStock) entry.soldOut = false;
  }
  response.json(result);
});

app.get("/api/game/collections", (_request, response) => {
  response.json(collections);
});

// Topplista — players ranked by unique Cards owned across all Collections,
// Special left out (the same count as Collection progress). Ties break on unique
// Legendary, then Epic, then Rare. Copies never count. Players still tied share
// the rank (1, 2, 2, 4) and are listed alphabetically.
app.get("/api/leaderboard", authed, (_request, response) => {
  const users = db.prepare("SELECT id, username FROM users").all();
  const ownedStmt = db.prepare("SELECT DISTINCT card_id FROM owned_cards WHERE user_id = ?");

  const entries = users.map((u) => {
    const counts = { common: 0, rare: 0, epic: 0, legendary: 0 };
    for (const row of ownedStmt.all(u.id)) {
      const card = cardById.get(row.card_id);
      if (card && counts[card.rarity] !== undefined) counts[card.rarity] += 1;
    }
    const total = counts.common + counts.rare + counts.epic + counts.legendary;
    return { userId: u.id, username: u.username, total, ...counts };
  });

  entries.sort((a, b) =>
    b.total - a.total ||
    b.legendary - a.legendary ||
    b.epic - a.epic ||
    b.rare - a.rare ||
    a.username.localeCompare(b.username, "sv"),
  );

  const sameScore = (a, b) =>
    a.total === b.total && a.legendary === b.legendary && a.epic === b.epic && a.rare === b.rare;
  const ranked = entries.slice(0, 100).map((e, i, all) => ({
    rank: i > 0 && sameScore(all[i - 1], e) ? null : i + 1,
    ...e,
  }));
  for (let i = 1; i < ranked.length; i++) if (ranked[i].rank === null) ranked[i].rank = ranked[i - 1].rank;

  response.json(ranked);
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
  // The claim ends the absence, so note the return before the date moves on.
  syncComeback(request.auth.userId);

  let streak = state.diamond_streak + 1;
  let streakBonusAwarded = 0;
  if (streak >= DIAMOND_STREAK_TARGET) {
    streakBonusAwarded = DIAMOND_STREAK_BONUS;
    streak = 0; // paid out — the track starts over
  }

  // During an event the base claim changes (e.g. 800 instead of 150); the
  // streak bonus is still paid on top.
  const dailyAmount = dailyDiamondsNow();
  const diamondsAwarded = dailyAmount + streakBonusAwarded;

  db.prepare(
    "UPDATE player_state SET diamonds = diamonds + ?, last_daily_claim_date = ?, diamond_streak = ? WHERE user_id = ?",
  ).run(diamondsAwarded, todayIso(), streak, request.auth.userId);
  logGameEvent(request.auth.userId, "daily", { diamonds: dailyAmount });
  if (streakBonusAwarded > 0) {
    logGameEvent(request.auth.userId, "streak_bonus", { diamonds: streakBonusAwarded });
  }

  response.json({
    diamondsAwarded,
    streakBonusAwarded,
    diamondStreak: streak,
    state: buildStateResponse(request.auth.userId),
  });
});

app.get("/api/game/weekly-goals", authed, (request, response) => {
  settleWeeklyGoals();
  response.json(buildWeeklyGoalsResponse(request.auth.userId));
});

app.post("/api/game/weekly-goals/:id/claim", authed, (request, response) => {
  const userId = request.auth.userId;
  const goal = weeklyGoalById.get(request.params.id);
  if (!goal) { response.status(404).json({ message: "Okänt veckomål." }); return; }

  settleWeeklyGoals();
  ensurePlayerState(userId);
  const claimed = db.transaction(() => {
    // The UPDATE only matches a finished, unclaimed goal, so a double tap pays once.
    const info = db.prepare(
      `UPDATE weekly_goal_progress SET claimed = 1
       WHERE user_id = ? AND week_start = ? AND goal_id = ? AND claimed = 0 AND progress >= ?`,
    ).run(userId, weekStartIso(), goal.id, goal.target);
    if (info.changes === 0) return false;
    db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(goal.reward, userId);
    logGameEvent(userId, "weekly_goal", { diamonds: goal.reward });
    return true;
  })();
  if (!claimed) { response.status(400).json({ message: "Veckomålet är inte klart eller redan inlöst." }); return; }

  response.json({ diamondsAwarded: goal.reward, ...buildWeeklyGoalsResponse(userId), state: buildStateResponse(userId) });
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

function isPackOnSale(pack, now = clock.now()) {
  if (!pack || pack.purchasable === false) return false;
  if (pack.releaseAt) {
    const releaseMs = Date.parse(pack.releaseAt);
    if (Number.isFinite(releaseMs) && now < releaseMs) return false;
  }
  return true;
}

/** Hands over the Cards of opened Packs and records it. Call inside a transaction; `price` is the Diamonds paid (0 for a free Pack). */
function receivePacks(userId, collectionId, quantity, pulledCards, price) {
  let newCards = 0;
  for (const card of pulledCards) if (grantCard(userId, card.id)) newCards += 1;
  addWeeklyGoalProgress(userId, "packsOpened", quantity);
  addWeeklyGoalProgress(userId, "newCards", newCards);
  db.prepare(
    `INSERT INTO packs_opened (user_id, collection_id, count) VALUES (?, ?, ?)
     ON CONFLICT (user_id, collection_id) DO UPDATE SET count = count + excluded.count`,
  ).run(userId, collectionId, quantity);
  logGameEvent(userId, "pack", { collectionId, quantity, diamonds: price });
}

// ── Starter: free Pack and "Kom igång" checklist ────────────────────────────
// A new account gets one free Pack (from the newest Collection on sale), shown
// first in "Väntar på dig", and a four-step checklist paying STARTER_STEP_REWARD
// each. The rows are created lazily, so accounts that predate this feature get
// them on first look, but only if they have never opened a Pack.

const STARTER_STEP_REWARD = 100;
const STARTER_STEPS = [
  { id: "first-pack", title: "Öppna ditt första Pack" },
  { id: "daily", title: "Hämta dagliga diamanter" },
  { id: "collection", title: "Kolla din Samling" },
  { id: "trade", title: "Skicka ditt första bytesförslag" },
];

function totalPacksOpened(userId) {
  return db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM packs_opened WHERE user_id = ?").get(userId).n;
}

function ensureStarterState(userId) {
  if (db.prepare("SELECT 1 FROM starter_state WHERE user_id = ?").get(userId)) return;
  const eligible = totalPacksOpened(userId) === 0 ? 1 : 0;
  db.prepare("INSERT INTO starter_state (user_id, free_pack, checklist) VALUES (?, ?, ?)").run(userId, eligible, eligible);
}

/** The newest Collection whose Pack is on sale and still has Copies. */
function starterCollection() {
  for (let i = collections.length - 1; i >= 0; i--) {
    const c = collections[i];
    if (isPackOnSale(c.pack) && stmtSumAvailableCopies.get(c.id).total > 0) return c;
  }
  return null;
}

function starterStepDone(userId, stepId, state) {
  switch (stepId) {
    case "first-pack": return totalPacksOpened(userId) > 0;
    case "daily": return db.prepare("SELECT last_daily_claim_date FROM player_state WHERE user_id = ?").get(userId)?.last_daily_claim_date != null;
    case "collection": return Boolean(state.viewed_collection);
    case "trade": return Boolean(db.prepare("SELECT 1 FROM trades WHERE sender_user_id = ?").get(userId));
    default: return false;
  }
}

function buildStarterResponse(userId) {
  ensureStarterState(userId);
  const state = db.prepare("SELECT * FROM starter_state WHERE user_id = ?").get(userId);
  const claimed = new Set(db.prepare("SELECT step FROM starter_claims WHERE user_id = ?").all(userId).map((r) => r.step));
  const steps = STARTER_STEPS.map((s) => ({
    id: s.id, title: s.title, reward: STARTER_STEP_REWARD,
    done: starterStepDone(userId, s.id, state), claimed: claimed.has(s.id),
  }));
  const collection = state.free_pack ? starterCollection() : null;
  return {
    visible: Boolean(state.checklist) && steps.some((s) => !s.claimed),
    steps,
    freePack: collection ? { collectionId: collection.id, label: collection.pack.label ?? collection.label } : null,
  };
}

app.get("/api/game/starter", authed, (request, response) => {
  response.json(buildStarterResponse(request.auth.userId));
});

app.post("/api/game/starter/free-pack/claim", authed, (request, response) => {
  const userId = request.auth.userId;
  const { freePack } = buildStarterResponse(userId);
  if (!freePack) { response.status(400).json({ message: "Ingen gratis pack att hämta." }); return; }
  const collection = collectionsMap.get(freePack.collectionId);
  const pulledCards = openPackCards(collection.pack, collection.id);
  db.transaction(() => {
    db.prepare("UPDATE starter_state SET free_pack = 0 WHERE user_id = ?").run(userId);
    db.prepare("UPDATE player_state SET last_opened_cards = ? WHERE user_id = ?").run(JSON.stringify(pulledCards), userId);
    receivePacks(userId, collection.id, 1, pulledCards, 0);
  })();
  response.json({ pulledCards, state: buildStateResponse(userId) });
});

app.post("/api/game/starter/collection-viewed", authed, (request, response) => {
  const userId = request.auth.userId;
  ensureStarterState(userId);
  db.prepare("UPDATE starter_state SET viewed_collection = 1 WHERE user_id = ?").run(userId);
  response.json(buildStarterResponse(userId));
});

app.post("/api/game/starter/:step/claim", authed, (request, response) => {
  const userId = request.auth.userId;
  const starter = buildStarterResponse(userId);
  const step = starter.steps.find((s) => s.id === request.params.step);
  if (!step || !db.prepare("SELECT checklist FROM starter_state WHERE user_id = ?").get(userId).checklist) {
    response.status(400).json({ message: "Okänt steg." }); return;
  }
  if (!step.done) { response.status(400).json({ message: "Steget är inte klart än." }); return; }
  try {
    db.transaction(() => {
      if (db.prepare("INSERT OR IGNORE INTO starter_claims (user_id, step) VALUES (?, ?)").run(userId, step.id).changes === 0) {
        throw new Error("Du har redan hämtat den här belöningen.");
      }
      db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(step.reward, userId);
      logGameEvent(userId, "starter_step", { collectionId: step.id, diamonds: step.reward });
    })();
  } catch (err) {
    response.status(400).json({ message: err.message }); return;
  }
  response.json({ diamondsAwarded: step.reward, starter: buildStarterResponse(userId), state: buildStateResponse(userId) });
});

// ── Comeback: "Välkommen tillbaka" summary and gift ─────────────────────────
// A player who returns after COMEBACK_AWAY_DAYS or more without a Daily claim
// gets a one-time summary of what is new and a COMEBACK_GIFT in "Väntar på dig",
// at most once per COMEBACK_GIFT_SPACING_DAYS. The return is recorded (in
// comeback_state) the first time we see it, so claiming the Daily, which moves
// last_daily_claim_date, cannot lose it.

const COMEBACK_AWAY_DAYS = 14;
const COMEBACK_GIFT_SPACING_DAYS = 30;
const COMEBACK_GIFT = 300;

/** Whole days from one YYYY-MM-DD to another. */
function daysBetweenDates(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / (24 * 60 * 60 * 1000));
}

/** Seam for the "Det här är nytt" sheet (#48): while it is due, the summary stays hidden. */
function whatsNewSheetDue(_userId) {
  return false;
}

/** Records a return if the player is eligible for one; returns their comeback row (or undefined). */
function syncComeback(userId) {
  const row = db.prepare("SELECT * FROM comeback_state WHERE user_id = ?").get(userId);
  if (row?.gift_pending) return row; // an unclaimed return stays as it is
  const last = db.prepare("SELECT last_daily_claim_date FROM player_state WHERE user_id = ?").get(userId)?.last_daily_claim_date;
  if (!last || daysBetweenDates(last, todayIso()) < COMEBACK_AWAY_DAYS) return row;
  if (row?.away_since === last) return row; // this absence was already handled
  if (row?.last_gift_at && clock.now() - Date.parse(row.last_gift_at) < COMEBACK_GIFT_SPACING_DAYS * 24 * 60 * 60 * 1000) return row;
  db.prepare(
    `INSERT INTO comeback_state (user_id, away_since, gift_pending, summary_pending) VALUES (?, ?, 1, ?)
     ON CONFLICT (user_id) DO UPDATE SET away_since = excluded.away_since, gift_pending = 1, summary_pending = excluded.summary_pending`,
  ).run(userId, last, whatsNewSheetDue(userId) ? 0 : 1);
  return db.prepare("SELECT * FROM comeback_state WHERE user_id = ?").get(userId);
}

function buildComebackSummary(userId, row) {
  const day = (iso) => stockholmDate.format(new Date(iso));
  const today = todayIso();
  const owned = new Set(
    db.prepare("SELECT DISTINCT card_id FROM owned_cards WHERE user_id = ?").all(userId).map((r) => r.card_id),
  );
  const newCollections = collections
    .filter((c) => c.pack?.releaseAt && day(c.pack.releaseAt) > row.away_since && day(c.pack.releaseAt) <= today)
    .map((c) => {
      const cards = allCards.filter((card) => card.collectionId === c.id && PROGRESS_RARITIES.includes(card.rarity));
      return { id: c.id, label: c.label, owned: cards.filter((card) => owned.has(card.id)).length, total: cards.length };
    });
  const newEvents = allEvents()
    .filter((e) => day(e.startsAt) > row.away_since && eventStatus(e) !== "upcoming" && Date.parse(e.endsAt) > clock.now())
    .map((e) => ({ id: e.id, label: e.label, startsAt: e.startsAt, endsAt: e.endsAt }));
  return { awayDays: daysBetweenDates(row.away_since, today), collections: newCollections, events: newEvents };
}

app.get("/api/game/comeback", authed, (request, response) => {
  const userId = request.auth.userId;
  const row = syncComeback(userId);
  response.json({ summary: row?.summary_pending ? buildComebackSummary(userId, row) : null });
});

app.post("/api/game/comeback/summary-seen", authed, (request, response) => {
  db.prepare("UPDATE comeback_state SET summary_pending = 0 WHERE user_id = ?").run(request.auth.userId);
  response.json({ summary: null });
});

app.post("/api/game/comeback/gift/claim", authed, (request, response) => {
  const userId = request.auth.userId;
  const row = syncComeback(userId);
  if (!row?.gift_pending) { response.status(400).json({ message: "Ingen present att hämta." }); return; }
  db.transaction(() => {
    db.prepare("UPDATE comeback_state SET gift_pending = 0, last_gift_at = ? WHERE user_id = ?")
      .run(new Date(clock.now()).toISOString(), userId);
    db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(COMEBACK_GIFT, userId);
    logGameEvent(userId, "comeback_gift", { diamonds: COMEBACK_GIFT });
  })();
  response.json({ diamondsAwarded: COMEBACK_GIFT, state: buildStateResponse(userId) });
});

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
  // A collection can be fully live (cards, Samling, trading, upgrades, chests)
  // before its pack goes on sale. pack.purchasable: false holds it back
  // indefinitely; pack.releaseAt (ISO time) opens sales automatically at that
  // moment — the server's clock decides, not the client's.
  if (!isPackOnSale(collection.pack)) {
    response.status(400).json({ message: "Det här packet går inte att köpa än." });
    return;
  }

  const { total: copiesLeft } = stmtSumAvailableCopies.get(collectionId);
  if (copiesLeft <= 0) {
    response.status(400).json({ message: "Slutsålt." });
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
    receivePacks(request.auth.userId, collectionId, quantity, pulledCards, totalPrice);
  })();

  response.json({ pulledCards, state: buildStateResponse(request.auth.userId) });
});

const stmtGiftClaimed = db.prepare("SELECT 1 FROM event_gift_claims WHERE event_id = ? AND user_id = ?");
const stmtLogEvent = db.prepare(
  "INSERT INTO game_events (user_id, type, collection_id, quantity, diamonds, created_at, reason) VALUES (?, ?, ?, ?, ?, ?, ?)",
);
// Appends one row to the economy timeline the admin statistics page reads.
function logGameEvent(userId, type, { collectionId = null, quantity = 0, diamonds = 0, reason = null } = {}) {
  stmtLogEvent.run(userId, type, collectionId, quantity, diamonds, new Date(clock.now()).toISOString(), reason);
}

// The game's automatic pick for an Upgrade: Duplicates only, skipping Cards set
// to Behåll, taken from the Cards with the most spare Copies first. The player
// can adjust it before confirming.
app.get("/api/game/upgrade/pick/:collectionId/:rarity", authed, (request, response) => {
  const userId = request.auth.userId;
  const { collectionId, rarity } = request.params;
  const cost = UPGRADE_CARDS_REQUIRED[rarity];
  const targetRarity = TIER_UPGRADE_TARGET[rarity];
  if (!cost || !targetRarity) {
    response.status(400).json({ message: "Den rariteten kan inte uppgraderas." });
    return;
  }
  const spare = availableForTrade(userId)
    .filter((a) => cardById.get(a.cardId)?.collectionId === collectionId && cardById.get(a.cardId)?.rarity === rarity)
    .sort((a, b) => b.quantity - a.quantity || a.cardId.localeCompare(b.cardId));
  const have = spare.reduce((n, a) => n + a.quantity, 0);
  const cardIds = [];
  for (const { cardId, quantity } of spare) {
    for (let i = 0; i < quantity && cardIds.length < cost; i++) cardIds.push(cardId);
  }
  const poolHasTarget = stmtCountCardsOfRarity.get(collectionId, targetRarity).n > 0;
  response.json({ cost, needed: cost, have, cardIds, targetRarity, canUpgrade: have >= cost && poolHasTarget });
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

  // Only Duplicates can be given up (never a player's only Copy), and never a
  // Card set to Behåll: the same Copies that are Available for Trade.
  const spare = new Map(availableForTrade(userId).map((a) => [a.cardId, a.quantity]));
  for (const [cardId, count] of requestedCounts) {
    if ((spare.get(cardId) ?? 0) < count) {
      response.status(400).json({ message: "Du kan bara byta in dubbletter av kort du inte har satt till Behåll." });
      return;
    }
  }

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

  const targetCardId = pickCardOfRarity(collectionId, targetRarity)?.card_id;
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
    if (grantCard(userId, targetCardId)) addWeeklyGoalProgress(userId, "newCards", 1);
    db.prepare(
      `INSERT INTO upgrades (user_id, collection_id, from_rarity, to_rarity, consumed_card_ids, result_card_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      userId, collectionId, rarity, targetRarity,
      JSON.stringify(rowsToDelete.map((r) => r.card_id)), targetCardId, new Date(clock.now()).toISOString(),
    );

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
      chip: definition.chip,
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
    ).run(userId, definition.id, new Date(clock.now()).toISOString());
    db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(definition.reward, userId);
    logGameEvent(userId, "achievement", { collectionId: definition.collectionId, diamonds: definition.reward });
  })();

  response.json({ diamondsAwarded: definition.reward, achievements: buildAchievementsResponse(userId), state: buildStateResponse(userId) });
});

// ── Trade helpers ─────────────────────────────────────────────────────────────

// Relative card values come straight from the game's own upgrade ladder
// (UPGRADE_CARDS_REQUIRED above): 500 commons make a rare, 15 rares an epic,
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

// Per-Copy facts for whoever receives each side of a Trade. `recipientOwned`
// is how many Copies the recipient holds now: 0 shows "Ny!", more shows "Har
// redan (×N)". On the requested side a Copy the receiver has not made
// Available for Trade is flagged `notForTrade` ("Inte till byte"); asking for
// it is still allowed.
function describeCopies(cardIds, recipientId, giverId = null) {
  const recipientOwned = ownedCountMap(recipientId);
  const giverAvailable = giverId
    ? new Map(availableForTrade(giverId).map((a) => [a.cardId, a.quantity]))
    : null;
  const seen = new Map();
  return cardIds.map((cardId) => {
    const owned = recipientOwned.get(cardId) ?? 0;
    const copy = { cardId, recipientOwned: owned, isNew: owned === 0 };
    if (giverAvailable) {
      const nth = (seen.get(cardId) ?? 0) + 1;
      seen.set(cardId, nth);
      copy.notForTrade = nth > (giverAvailable.get(cardId) ?? 0);
    }
    return copy;
  });
}

function rarityTotals(cardIds) {
  const totals = {};
  for (const id of cardIds) {
    const rarity = cardById.get(id)?.rarity;
    if (rarity) totals[rarity] = (totals[rarity] ?? 0) + 1;
  }
  return totals;
}

function buildTrade(row) {
  const offeredCardIds = JSON.parse(row.offered_card_ids);
  const requestedCardIds = JSON.parse(row.requested_card_ids);
  return {
    id: row.id,
    status: row.status,
    sender: { id: row.sender_user_id, username: row.sender_username },
    receiver: { id: row.receiver_user_id, username: row.receiver_username },
    offeredCardIds,
    offeredDiamonds: row.offered_diamonds,
    requestedCardIds,
    requestedDiamonds: row.requested_diamonds,
    offeredCopies: describeCopies(offeredCardIds, row.receiver_user_id),
    requestedCopies: describeCopies(requestedCardIds, row.sender_user_id, row.receiver_user_id),
    offeredRarity: rarityTotals(offeredCardIds),
    requestedRarity: rarityTotals(requestedCardIds),
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

  // A banned player's Available for Trade Copies are hidden from others until
  // the ban ends (they still see their own).
  const hideMarks = user.id !== request.auth.userId && isUserBanned(user.id);
  const cardsForTrade = hideMarks ? [] : availableForTrade(user.id);

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

// Available for Trade (GLOSSARY): every Copy beyond the first, unless the player
// has set the Card to Behåll. Derived, never stored.
function availableForTrade(userId) {
  const kept = new Set(
    db.prepare("SELECT card_id FROM kept_cards WHERE user_id = ?").all(userId).map((r) => r.card_id),
  );
  const result = [];
  for (const [cardId, owned] of ownedCountMap(userId)) {
    if (kept.has(cardId) || owned < 2 || cardById.get(cardId)?.rarity === "special") continue;
    result.push({ cardId, quantity: owned - 1 });
  }
  return result;
}

// Set or clear Behåll for a Card the player owns.
app.put("/api/game/keep/:cardId", authed, (request, response) => {
  const userId = request.auth.userId;
  const cardId = String(request.params.cardId);
  if (!cardById.has(cardId)) {
    response.status(404).json({ message: "Okänt kort." });
    return;
  }
  if (request.body?.keep === true && !ownedCountMap(userId).has(cardId)) {
    response.status(400).json({ message: "Du äger inte det här kortet." });
    return;
  }
  if (typeof request.body?.keep !== "boolean") {
    response.status(400).json({ message: "keep måste vara true eller false." });
    return;
  }
  if (request.body.keep) {
    db.prepare("INSERT OR IGNORE INTO kept_cards (user_id, card_id) VALUES (?, ?)").run(userId, cardId);
  } else {
    db.prepare("DELETE FROM kept_cards WHERE user_id = ? AND card_id = ?").run(userId, cardId);
  }
  response.json({ cardId, keep: request.body.keep });
});

app.get("/api/users/:userId/cards-for-trade", authed, (request, response) => {
  // Hidden entirely while that player is banned.
  if (request.params.userId !== request.auth.userId && isUserBanned(request.params.userId)) {
    response.json({ cards: [] });
    return;
  }
  response.json({ cards: availableForTrade(request.params.userId) });
});

// ── Trade market routes ───────────────────────────────────────────────────────
// Ways to find a Trade partner besides searching for a username: Matchningar,
// and "Hitta byte" (who has this Card available).

// Every Available for Trade Copy in the game, per player. Shared by the market
// endpoints so the rule lives in one place.
function liveMarketRows() {
  const rows = [];
  for (const u of db.prepare("SELECT id, username, banned_until FROM users").all()) {
    // Banned players' Copies are left off the market until the ban ends.
    if (activeBan(u)) continue;
    for (const c of availableForTrade(u.id)) {
      if (cardById.has(c.cardId)) rows.push({ userId: u.id, username: u.username, cardId: c.cardId, quantity: c.quantity });
    }
  }
  return rows;
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

// Matchningar: players who have Copies Available for Trade of Cards the caller
// is missing. Two-way matches ("Ni kan byta med varandra") are those where the
// caller also has an Available Copy of a Card the other player is missing.
// Ranked two-way first, then by how many of the caller's Missing Cards they have.
app.get("/api/market/matches", authed, (request, response) => {
  const me = request.auth.userId;
  const myOwned = ownedCountMap(me);
  const myAvailable = availableForTrade(me).filter((c) => cardById.has(c.cardId));

  const theirByUser = new Map();
  for (const row of liveMarketRows()) {
    if (row.userId === me || myOwned.has(row.cardId)) continue;
    if (!theirByUser.has(row.userId)) theirByUser.set(row.userId, { userId: row.userId, username: row.username, theyCanGive: [] });
    theirByUser.get(row.userId).theyCanGive.push({ cardId: row.cardId, quantity: row.quantity });
  }

  const matches = [];
  for (const entry of theirByUser.values()) {
    const theirOwned = ownedCountMap(entry.userId);
    const youCanGive = myAvailable.filter((c) => !theirOwned.has(c.cardId));
    matches.push({ ...entry, youCanGive, twoWay: youCanGive.length > 0 });
  }
  matches.sort(
    (a, b) =>
      Number(b.twoWay) - Number(a.twoWay) ||
      b.theyCanGive.length - a.theyCanGive.length ||
      a.username.localeCompare(b.username, "sv"),
  );
  response.json({ matches });
});

// ── Trade routes ──────────────────────────────────────────────────────────────

// Trade limits: a pending Trade lives 7 days, and a player may have at most 10
// outgoing at once. Expiry is derived from created_at and the injected clock —
// nothing is stored, so an expired Trade simply stops counting as pending.
const TRADE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_OUTGOING_PENDING_TRADES = 10;
const tradeCutoffIso = () => new Date(clock.now() - TRADE_TTL_MS).toISOString();
const isTradeExpired = (row) => row.created_at < tradeCutoffIso();

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
  if (isUserBanned(receiverUserId)) {
    return { status: 400, message: "Spelaren är avstängd och kan inte ta emot byten just nu." };
  }
  const { n: outgoing } = db
    .prepare("SELECT COUNT(*) AS n FROM trades WHERE sender_user_id = ? AND status = 'pending' AND created_at >= ?")
    .get(senderId, tradeCutoffIso());
  if (outgoing >= MAX_OUTGOING_PENDING_TRADES) {
    return { status: 400, message: `Du kan högst ha ${MAX_OUTGOING_PENDING_TRADES} utgående byten åt gången.` };
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
  // Any card the receiver actually owns may be asked for. Available for Trade
  // is a signal of willingness (and what the market lists), not a gate: the
  // receiver still has to accept, so an unlisted request costs them nothing but
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
    new Date(clock.now()).toISOString(), null,
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
  if (original.status !== "pending" || isTradeExpired(original)) {
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
        new Date(clock.now()).toISOString(), original.id,
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
    WHERE (t.sender_user_id = ? OR t.receiver_user_id = ?)
      AND NOT (t.status = 'pending' AND t.created_at < ?)
    ORDER BY t.created_at DESC
  `).all(userId, userId, tradeCutoffIso());
  response.json(rows.map(buildTrade));
});

// Cheap poll for the "Byte" nav badge — how many trades are waiting on me.
app.get("/api/trade/incoming-count", authed, (request, response) => {
  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM trades WHERE receiver_user_id = ? AND status = 'pending' AND created_at >= ?")
    .get(request.auth.userId, tradeCutoffIso());
  response.json({ count: n });
});

app.post("/api/trade/:id/accept", authed, (request, response) => {
  const userId = request.auth.userId;
  const row = stmtTradeById.get(request.params.id);

  if (!row) { response.status(404).json({ message: "Handel hittades inte." }); return; }
  if (row.receiver_user_id !== userId) { response.status(403).json({ message: "Inte behörig." }); return; }
  if (row.status !== "pending" || isTradeExpired(row)) { response.status(400).json({ message: "Handeln är inte längre aktiv." }); return; }

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
      const newFor = { [userId]: 0, [senderId]: 0 };

      for (const cardId of offeredCardIds) {
        stmtDel.run(senderId, cardId); if (grantCard(userId, cardId)) newFor[userId] += 1;
      }
      for (const cardId of requestedCardIds) {
        stmtDel.run(userId, cardId); if (grantCard(senderId, cardId)) newFor[senderId] += 1;
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
      // Each side logs the Diamonds it handed over, so both histories show the Trade.
      if (row.offered_diamonds > 0) logGameEvent(senderId, "trade_diamonds", { diamonds: row.offered_diamonds });
      if (row.requested_diamonds > 0) logGameEvent(userId, "trade_diamonds", { diamonds: row.requested_diamonds });

      // A Trade only counts for a player who received at least one new Card.
      for (const [who, newCards] of Object.entries(newFor)) {
        addWeeklyGoalProgress(who, "newCards", newCards);
        if (newCards > 0) addWeeklyGoalProgress(who, "tradeCompleted", 1);
      }
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
  if (row.status !== "pending" || isTradeExpired(row)) { response.status(400).json({ message: "Handeln är inte längre aktiv." }); return; }
  db.prepare("UPDATE trades SET status = 'rejected' WHERE id = ?").run(row.id);
  response.status(204).send();
});

app.post("/api/trade/:id/cancel", authed, (request, response) => {
  const userId = request.auth.userId;
  const row = db.prepare("SELECT * FROM trades WHERE id = ?").get(request.params.id);
  if (!row || row.sender_user_id !== userId) { response.status(403).json({ message: "Inte behörig." }); return; }
  if (row.status !== "pending" || isTradeExpired(row)) { response.status(400).json({ message: "Handeln är inte längre aktiv." }); return; }
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

/** The payout range for a Chest type under a payout table (default: the current one). */
function chestPayout(type, tableId = chestPayouts.current) {
  const range = chestPayouts.tables[tableId]?.[type];
  if (!range) throw new Error(`No payout for ${type} Chests in payout table "${tableId}".`);
  return range;
}

function rollDiamonds({ min, max, step }) {
  const steps = Math.floor((max - min) / step) + 1;
  return min + Math.floor(random() * steps) * step;
}

// Draw a random card of a given rarity out of the shared pool and remove that
// copy, so cards won from chests really do leave circulation. Returns null when
// the pool has none of that rarity left.
const stmtCountAnyOfRarity = db.prepare(
  "SELECT COUNT(*) AS n FROM card_pool WHERE rarity = ? AND copies_remaining > 0",
);
const stmtNthAnyOfRarity = db.prepare(
  "SELECT card_id FROM card_pool WHERE rarity = ? AND copies_remaining > 0 ORDER BY card_id LIMIT 1 OFFSET ?",
);
const drawCardOfRarityTx = db.transaction((rarity) => {
  const { n } = stmtCountAnyOfRarity.get(rarity);
  if (n === 0) return null;
  const row = stmtNthAnyOfRarity.get(rarity, Math.min(n - 1, Math.floor(random() * n)));
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
    ready: Date.parse(row.ready_at) <= clock.now(),
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
      waitHours: chestWaitMs(c.id) / HOUR_MS,
      diamondMin: chestPayout(c.id).min,
      diamondMax: chestPayout(c.id).max,
    })),
  };
}

/** Wait time for a chest bought at `now` — an event may shorten it. */
function chestWaitMs(type, now = clock.now()) {
  const base = CHEST_TYPES[type].waitMs;
  const eventHours = activeEvent(now)?.chestWaitHours?.[type];
  return eventHours != null ? Math.min(base, eventHours * HOUR_MS) : base;
}

// When an event shortens a chest type, chests already running at the event
// start are capped too: nothing of that type may finish later than
// event start + the event's wait. Idempotent (only ever moves ready_at
// earlier), so it's safe to run on every chest request and on a timer.
// ready_at is stored as toISOString(), so string comparison is time order.
function applyEventChestCaps(now = clock.now()) {
  const event = activeEvent(now);
  if (!event?.chestWaitHours) return;
  const start = Date.parse(event.startsAt);
  for (const [type, hours] of Object.entries(event.chestWaitHours)) {
    const cap = new Date(start + hours * HOUR_MS).toISOString();
    db.prepare("UPDATE chests SET ready_at = ? WHERE type = ? AND bought_at < ? AND ready_at > ?")
      .run(cap, type, new Date(start).toISOString(), cap);
  }
}
applyEventChestCaps();

app.get("/api/game/chests", authed, (request, response) => {
  applyEventChestCaps();
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

      const now = clock.now();
      db.prepare("UPDATE player_state SET diamonds = diamonds - ? WHERE user_id = ?").run(config.price, userId);
      db.prepare("INSERT INTO chests (id, user_id, type, bought_at, ready_at, payout_table) VALUES (?, ?, ?, ?, ?, ?)").run(
        crypto.randomUUID(),
        userId,
        config.id,
        new Date(now).toISOString(),
        new Date(now + chestWaitMs(config.id, now)).toISOString(),
        chestPayouts.current,
      );
      logGameEvent(userId, "chest_buy", { collectionId: config.id, diamonds: config.price });
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
        new Date(clock.now()).toISOString(),
      );
      logGameEvent(userId, "slot_buy", { collectionId: type, diamonds: price });
    })();
  } catch (err) {
    response.status(400).json({ message: err.message });
    return;
  }

  response.json({ ...buildChestsResponse(userId), state: buildStateResponse(userId) });
});

app.post("/api/game/chests/:id/collect", authed, (request, response) => {
  const userId = request.auth.userId;
  applyEventChestCaps();
  const chest = db.prepare("SELECT * FROM chests WHERE id = ?").get(request.params.id);

  if (!chest || chest.user_id !== userId) {
    response.status(404).json({ message: "Kistan hittades inte." });
    return;
  }
  if (Date.parse(chest.ready_at) > clock.now()) {
    response.status(400).json({ message: "Kistan är inte redo att öppnas än." });
    return;
  }

  const config = CHEST_TYPES[chest.type];
  if (!config) {
    response.status(400).json({ message: "Okänd kista." });
    return;
  }

  // An Event's multiplier applies to Chests opened while it runs.
  const eventMultiplier = activeEvent()?.chestMultiplier ?? 1;
  const diamondsAwarded = Math.round(rollDiamonds(chestPayout(chest.type, chest.payout_table)) * eventMultiplier);
  let wonCardIds = [];

  try {
    // One transaction so a concurrent double-submit can't pay out twice or
    // burn pool copies for a chest that was already opened.
    db.transaction(() => {
      const info = db.prepare("DELETE FROM chests WHERE id = ? AND user_id = ?").run(chest.id, userId);
      if (info.changes === 0) throw new Error("Kistan är redan öppnad.");

      wonCardIds = [];
      for (const roll of config.cardRolls) {
        if (random() >= roll.chance) continue;
        const cardId = drawCardOfRarityTx(roll.rarity);
        if (cardId) wonCardIds.push(cardId);
      }

      db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(diamondsAwarded, userId);
      let newCards = 0;
      for (const cardId of wonCardIds) if (grantCard(userId, cardId)) newCards += 1;
      addWeeklyGoalProgress(userId, "newCards", newCards);
      logGameEvent(userId, "chest_open", { collectionId: chest.type, quantity: wonCardIds.length, diamonds: diamondsAwarded });
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

// ── "Väntar på dig" ─────────────────────────────────────────────────────────
// Everything the player can claim or act on right now, in display order. Each
// item carries the same payload the item's own screen uses, so the client acts
// on it with the same endpoint (accept trade, collect chest, claim achievement,
// claim daily). Later item types are appended here.
app.get("/api/game/waiting", authed, (request, response) => {
  const userId = request.auth.userId;
  applyEventChestCaps();
  const items = [];

  const starter = buildStarterResponse(userId);
  if (starter.freePack) items.push({ type: "starter_pack", id: "starter-pack", ...starter.freePack });

  const incoming = db.prepare(`
    SELECT t.*, su.username AS sender_username, ru.username AS receiver_username
    FROM trades t
    JOIN users su ON su.id = t.sender_user_id
    JOIN users ru ON ru.id = t.receiver_user_id
    WHERE t.receiver_user_id = ? AND t.status = 'pending' AND t.created_at >= ?
    ORDER BY t.created_at DESC
  `).all(userId, tradeCutoffIso());
  for (const row of incoming) items.push({ type: "trade", id: row.id, trade: buildTrade(row) });

  for (const chest of buildChestsResponse(userId).chests) {
    if (chest.ready) items.push({ type: "chest", id: chest.id, chest });
  }

  for (const achievement of buildAchievementsResponse(userId)) {
    if (achievement.complete && !achievement.claimed) {
      items.push({ type: "achievement", id: achievement.id, achievement });
    }
  }

  for (const goal of buildWeeklyGoalsResponse(userId).goals) {
    if (goal.complete && !goal.claimed) items.push({ type: "weekly_goal", id: goal.id, goal });
  }

  if (starter.visible) {
    for (const step of starter.steps) {
      if (step.done && !step.claimed) items.push({ type: "starter_step", id: step.id, title: step.title, reward: step.reward });
    }
  }

  if (syncComeback(userId)?.gift_pending) {
    items.push({ type: "comeback_gift", id: "comeback-gift", diamonds: COMEBACK_GIFT });
  }

  const running = activeEvent();
  if (running?.gift && !stmtGiftClaimed.get(running.id, userId)) {
    items.push({ type: "event_gift", id: running.id, label: running.label, gift: running.gift });
  }

  if (buildStateResponse(userId).canClaimDailyDiamonds) {
    items.push({ type: "daily", id: "daily", diamonds: dailyDiamondsNow() });
  }

  response.json({ items });
});

// ── Trade history cleanup ───────────────────────────────────────────────────────

const TRADE_HISTORY_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30 dagar
const TRADE_CLEANUP_INTERVAL_MS = 1000 * 60 * 60 * 24; // varje dygn

function clearOldTradeHistory() {
  const cutoff = new Date(clock.now() - TRADE_HISTORY_MAX_AGE_MS).toISOString();
  const staleWhere = "status != 'pending' AND created_at < ?";
  try {
    db.transaction(() => {
      // Counter-offers point at the trade they answer via counter_of_trade_id.
      // Detach any surviving trade from a parent we're about to delete, or the
      // self-referencing foreign key blocks the DELETE.
      db.prepare(
        `UPDATE trades SET counter_of_trade_id = NULL
         WHERE counter_of_trade_id IN (SELECT id FROM trades WHERE ${staleWhere})`,
      ).run(cutoff);
      db.prepare(`DELETE FROM trades WHERE ${staleWhere}`).run(cutoff);
    })();
  } catch (err) {
    console.error("Trade history cleanup failed:", err);
  }
}

clearOldTradeHistory();

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

// ── Maintenance mode ──────────────────────────────────────────────────────────

app.get("/api/maintenance", (_request, response) => { response.json(getMaintenance(db)); });
app.get("/api/admin/maintenance", requireAdmin, (_request, response) => { response.json(getMaintenance(db)); });
app.put("/api/admin/maintenance", requireAdmin, (request, response) => {
  const { on, reopensAt, note } = request.body ?? {};
  if (typeof on !== "boolean") { response.status(400).json({ message: "on måste vara true eller false." }); return; }
  let reopen = null;
  if (reopensAt) {
    if (Number.isNaN(Date.parse(reopensAt))) { response.status(400).json({ message: "Ogiltig tid för återöppning." }); return; }
    reopen = new Date(reopensAt).toISOString();
  }
  const text = typeof note === "string" && note.trim() ? note.trim().slice(0, 200) : null;
  response.json(setMaintenance(db, { on, reopensAt: reopen, note: text }));
});

// ── Top-ups ───────────────────────────────────────────────────────────────────
// When a Collection's Rare+ share of remaining Copies falls below the trigger,
// a pending Top-up appears for the admin to approve, edit or dismiss. Its
// amounts are pre-filled to reach the target share, split in the Collection's
// original Rare:Epic ratio. Legendary and Special are never part of a Top-up.
// The check re-runs whenever the pool may have changed (see the middleware
// below) and on every admin read, and is idempotent.

const TOPUP_TRIGGER = topUpConfig?.triggerShare ?? 0.03;
const TOPUP_TARGET = topUpConfig?.targetShare ?? 0.07;
const RARE_PLUS = ["rare", "epic", "legendary", "special"];
const TOPUP_RARITIES = ["rare", "epic"];
const TOPUP_FIRED_BANNER_DAYS = 7;

function collectionPoolStats(collectionId) {
  const remaining = {};
  let total = 0;
  for (const r of livePoolRows().filter((row) => row.collection_id === collectionId)) {
    remaining[r.rarity] = (remaining[r.rarity] ?? 0) + r.copies_remaining;
    total += r.copies_remaining;
  }
  const rarePlus = RARE_PLUS.reduce((sum, rarity) => sum + (remaining[rarity] ?? 0), 0);
  return { remaining, total, rarePlus, share: total > 0 ? rarePlus / total : null };
}

/** The Copies of Rare and Epic needed to reach the target share, in the Collection's original ratio. */
function computeTopUpAmounts(collectionId, stats) {
  const base = { rare: 0, epic: 0 };
  const available = { rare: 0, epic: 0 };
  for (const card of allCards) {
    if (card.collectionId !== collectionId || !TOPUP_RARITIES.includes(card.rarity)) continue;
    base[card.rarity] += copiesFor(card, copiesPerRarity, collectionsMap);
    available[card.rarity] += 1;
  }
  const needed = Math.max(0, Math.ceil((TOPUP_TARGET * stats.total - stats.rarePlus) / (1 - TOPUP_TARGET)));
  if (needed === 0 || available.rare + available.epic === 0) return { rare: 0, epic: 0 };
  const baseTotal = (available.rare ? base.rare : 0) + (available.epic ? base.epic : 0);
  const rare = available.epic === 0 ? needed
    : available.rare === 0 ? 0
    : Math.round((needed * base.rare) / baseTotal);
  return { rare, epic: needed - rare };
}

const stmtTopUpRow = db.prepare("SELECT * FROM topups WHERE collection_id = ?");

/** Brings each Collection's pending/dismissed Top-up in line with its pool. */
function refreshTopUps() {
  for (const collection of collections) {
    const stats = collectionPoolStats(collection.id);
    if (stats.share === null) continue; // sold out entirely: no share to speak of
    const row = stmtTopUpRow.get(collection.id);
    if (stats.share >= TOPUP_TRIGGER) {
      if (row) db.prepare("DELETE FROM topups WHERE collection_id = ?").run(collection.id);
      continue;
    }
    if (row?.status === "dismissed") continue;
    const { rare, epic } = computeTopUpAmounts(collection.id, stats);
    if (row) {
      db.prepare("UPDATE topups SET rare = ?, epic = ? WHERE collection_id = ?").run(rare, epic, collection.id);
      continue;
    }
    db.prepare("INSERT INTO topups (collection_id, status, rare, epic, created_at) VALUES (?, 'pending', ?, ?, ?)")
      .run(collection.id, rare, epic, new Date(clock.now()).toISOString());
    if (config.adminEmail) {
      Promise.resolve(mailer.sendTopUpPendingEmail?.(config.adminEmail, {
        collectionId: collection.id,
        collectionLabel: collection.label ?? collection.id,
        share: stats.share,
        rare,
        epic,
      })).catch((err) => console.error("Kunde inte skicka Top-up-mejl:", err));
    }
  }
}

try { refreshTopUps(); } catch (err) { console.error(err); }

/** Adds Copies to the Collection's Cards of a Rarity, spread evenly, and logs it. */
const applyTopUp = db.transaction((collectionId, amounts, source) => {
  for (const rarity of TOPUP_RARITIES) {
    const n = amounts[rarity];
    if (!n) continue;
    const rows = db
      .prepare("SELECT card_id FROM card_pool WHERE collection_id = ? AND rarity = ? ORDER BY card_id")
      .all(collectionId, rarity)
      .filter((r) => cardById.has(r.card_id));
    if (rows.length === 0) throw new Error(`Samlingen har inga ${rarity}-kort.`);
    const stmt = db.prepare(
      "UPDATE card_pool SET total_copies = total_copies + ?, copies_remaining = copies_remaining + ?, bonus_copies = bonus_copies + ? WHERE card_id = ?",
    );
    rows.forEach((r, i) => {
      const share = Math.floor(n / rows.length) + (i < n % rows.length ? 1 : 0);
      if (share) stmt.run(share, share, share, r.card_id);
    });
  }
  db.prepare("INSERT INTO topup_log (collection_id, rare, epic, source, created_at) VALUES (?, ?, ?, ?, ?)")
    .run(collectionId, amounts.rare ?? 0, amounts.epic ?? 0, source, new Date(clock.now()).toISOString());
  db.prepare("DELETE FROM topups WHERE collection_id = ? AND status = 'pending'").run(collectionId);
});

function parseAmounts(body) {
  const rare = Number(body?.rare ?? 0);
  const epic = Number(body?.epic ?? 0);
  if (![rare, epic].every((n) => Number.isInteger(n) && n >= 0 && n <= 100000) || rare + epic === 0) return null;
  return { rare, epic };
}

function fireTopUp(request, response, collectionId, source) {
  if (!collectionsMap.has(collectionId)) { response.status(400).json({ message: "Okänd samling." }); return; }
  const amounts = parseAmounts(request.body);
  if (!amounts) { response.status(400).json({ message: "Ange antal Rare och Epic (heltal, minst ett över 0)." }); return; }
  try {
    applyTopUp(collectionId, amounts, source);
  } catch (err) {
    response.status(400).json({ message: err.message });
    return;
  }
  refreshTopUps();
  response.json({ ok: true, ...amounts });
}

const topUpLogRow = (r) => ({ id: r.id, collectionId: r.collection_id, rare: r.rare, epic: r.epic, source: r.source, at: r.created_at });

app.get("/api/admin/topups", requireAdmin, (_request, response) => {
  refreshTopUps();
  response.json({
    pending: db.prepare("SELECT * FROM topups WHERE status = 'pending' ORDER BY created_at").all()
      .map((r) => ({ collectionId: r.collection_id, rare: r.rare, epic: r.epic, createdAt: r.created_at })),
    log: db.prepare("SELECT * FROM topup_log ORDER BY id DESC").all().map(topUpLogRow),
  });
});

app.post("/api/admin/topups/now", requireAdmin, (request, response) => {
  fireTopUp(request, response, String(request.body?.collectionId ?? ""), "manual");
});

app.post("/api/admin/topups/:collectionId/approve", requireAdmin, (request, response) => {
  const row = stmtTopUpRow.get(request.params.collectionId);
  if (row?.status !== "pending") { response.status(404).json({ message: "Ingen väntande Top-up för samlingen." }); return; }
  fireTopUp(request, response, request.params.collectionId, "approved");
});

app.post("/api/admin/topups/:collectionId/dismiss", requireAdmin, (request, response) => {
  const result = db.prepare("UPDATE topups SET status = 'dismissed' WHERE collection_id = ? AND status = 'pending'")
    .run(request.params.collectionId);
  if (result.changes === 0) { response.status(404).json({ message: "Ingen väntande Top-up för samlingen." }); return; }
  response.json({ ok: true });
});

// ── Event Top-up on start ─────────────────────────────────────────────────────
// An Event may carry a Top-up of a Collection that fires when the Event starts,
// aiming for the target share, with no second confirmation. It only fires while
// the Event runs: one that was missed entirely is marked done without firing.
// Checked at the start of every API request and on a timer.

function startDueEvents() {
  const now = clock.now();
  const due = db.prepare("SELECT * FROM events WHERE topup_collection_id IS NOT NULL AND topup_fired_at IS NULL").all();
  for (const row of due) {
    const event = eventFromRow(row);
    const status = eventStatus(event, now);
    if (status === "upcoming") continue;
    db.transaction(() => {
      db.prepare("UPDATE events SET topup_fired_at = ? WHERE id = ?").run(iso(now), event.id);
      if (status !== "running" || !collectionsMap.has(event.topUpCollectionId)) return;
      const amounts = computeTopUpAmounts(event.topUpCollectionId, collectionPoolStats(event.topUpCollectionId));
      if (amounts.rare + amounts.epic > 0) applyTopUp(event.topUpCollectionId, amounts, "event");
    })();
    refreshTopUps();
  }
}

try { startDueEvents(); } catch (err) { console.error(err); }

// ── Admin: Event builder ──────────────────────────────────────────────────────

class EventInputError extends Error {}

/** Validates an Event draft from the admin panel; returns the clean fields or throws. */
function parseEventInput(body, { excludeId = null } = {}) {
  const fail = (message) => { throw new EventInputError(message); };
  const label = String(body?.label ?? "").trim();
  if (!label || label.length > 60) fail("Ange ett namn (högst 60 tecken).");
  const start = Date.parse(body?.startsAt);
  const end = Date.parse(body?.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) fail("Ange start och slut.");
  if (end <= start) fail("Eventet måste sluta efter att det startar.");
  if (end <= clock.now()) fail("Eventet kan inte ligga helt i det förflutna.");

  const out = { label, startsAt: iso(start), endsAt: iso(end) };

  const daily = body?.dailyDiamonds ?? null;
  if (daily !== null && !(Number.isInteger(daily) && daily > 0 && daily <= 100000)) fail("Dagliga diamanter måste vara ett heltal.");
  out.dailyDiamonds = daily;

  const waits = body?.chestWaitHours ?? null;
  if (waits !== null) {
    if (typeof waits !== "object") fail("Ogiltig väntetid för kistor.");
    out.chestWaitHours = {};
    for (const [type, hours] of Object.entries(waits)) {
      if (hours == null) continue;
      if (!EVENT_CHEST_TYPES.includes(type) || !(Number(hours) > 0 && Number(hours) <= 1000)) fail("Ogiltig väntetid för kistor.");
      out.chestWaitHours[type] = Number(hours);
    }
  }

  const multiplier = body?.chestMultiplier ?? null;
  if (multiplier !== null && !(Number(multiplier) > 1 && Number(multiplier) <= 10)) fail("Kistmultiplikatorn måste vara över 1 (högst 10).");
  out.chestMultiplier = multiplier === null ? null : Number(multiplier);

  const gift = body?.gift ?? null;
  if (gift !== null) {
    if (gift.type === "diamonds" && Number.isInteger(gift.amount) && gift.amount > 0 && gift.amount <= 100000) {
      out.gift = { type: "diamonds", amount: gift.amount };
    } else if (gift.type === "chest" && EVENT_CHEST_TYPES.includes(gift.chestType)) {
      out.gift = { type: "chest", chestType: gift.chestType };
    } else fail("Ogiltig inloggningsgåva.");
  }

  const topUp = body?.topUpCollectionId ?? null;
  if (topUp !== null && !collectionsMap.has(topUp)) fail("Okänd samling för Top-up.");
  out.topUpCollectionId = topUp;

  const hasReward = out.dailyDiamonds !== null || (out.chestWaitHours && Object.keys(out.chestWaitHours).length > 0)
    || out.chestMultiplier !== null || out.gift || out.topUpCollectionId;
  if (!hasReward) fail("Välj minst en belöning.");

  const clash = allEvents().find((e) => e.id !== excludeId && start < Date.parse(e.endsAt) && end > Date.parse(e.startsAt));
  if (clash) fail(`Eventet överlappar "${clash.label}".`);
  return out;
}

const adminEventRow = (e) => ({ ...e, status: eventStatus(e) });

app.get("/api/admin/events", requireAdmin, (_request, response) => {
  response.json({ events: allEvents().map(adminEventRow), now: iso(clock.now()) });
});

app.post("/api/admin/events", requireAdmin, (request, response) => {
  try {
    const id = crypto.randomUUID();
    stmtInsertEvent.run(eventParams(id, parseEventInput(request.body)));
    startDueEvents();
    response.status(201).json({ event: adminEventRow(allEvents().find((e) => e.id === id)) });
  } catch (err) {
    if (!(err instanceof EventInputError)) throw err;
    response.status(400).json({ message: err.message });
  }
});

/** Loads an Event and answers 404 / 409 itself unless it is in one of the allowed states. */
function eventInState(request, response, allowed, message) {
  const event = allEvents().find((e) => e.id === request.params.id);
  if (!event) { response.status(404).json({ message: "Eventet hittades inte." }); return null; }
  if (!allowed.includes(eventStatus(event))) { response.status(409).json({ message }); return null; }
  return event;
}

app.put("/api/admin/events/:id", requireAdmin, (request, response) => {
  const event = eventInState(request, response, ["upcoming"], "Bara Event som inte har startat kan ändras.");
  if (!event) return;
  try {
    const params = eventParams(event.id, parseEventInput(request.body, { excludeId: event.id }));
    db.prepare(`
      UPDATE events SET label = @label, starts_at = @startsAt, ends_at = @endsAt, daily_diamonds = @dailyDiamonds,
        chest_wait_hours = @chestWaitHours, chest_multiplier = @chestMultiplier, gift_type = @giftType,
        gift_diamonds = @giftDiamonds, gift_chest_type = @giftChestType, topup_collection_id = @topUpCollectionId
      WHERE id = @id
    `).run(params);
    startDueEvents();
    response.json({ event: adminEventRow(allEvents().find((e) => e.id === event.id)) });
  } catch (err) {
    if (!(err instanceof EventInputError)) throw err;
    response.status(400).json({ message: err.message });
  }
});

app.delete("/api/admin/events/:id", requireAdmin, (request, response) => {
  const event = eventInState(request, response, ["upcoming"], "Bara Event som inte har startat kan tas bort.");
  if (!event) return;
  db.prepare("DELETE FROM events WHERE id = ?").run(event.id);
  response.json({ ok: true });
});

app.post("/api/admin/events/:id/end", requireAdmin, (request, response) => {
  const event = eventInState(request, response, ["running"], "Bara ett pågående Event kan avslutas i förtid.");
  if (!event) return;
  db.prepare("UPDATE events SET ends_at = ?, ended_early_at = ? WHERE id = ?").run(iso(clock.now()), iso(clock.now()), event.id);
  response.json({ event: adminEventRow(allEvents().find((e) => e.id === event.id)) });
});

// ── Event login gift ──────────────────────────────────────────────────────────
// Claimed once per player per Event, from "Väntar på dig", while the Event runs.

app.post("/api/game/events/:id/gift", authed, (request, response) => {
  const userId = request.auth.userId;
  const event = activeEvent();
  if (!event || event.id !== request.params.id || !event.gift) {
    response.status(400).json({ message: "Ingen gåva att hämta just nu." });
    return;
  }
  ensurePlayerState(userId);
  try {
    db.transaction(() => {
      if (db.prepare("INSERT OR IGNORE INTO event_gift_claims (event_id, user_id, claimed_at) VALUES (?, ?, ?)")
        .run(event.id, userId, iso(clock.now())).changes === 0) throw new Error("Du har redan hämtat gåvan.");
      if (event.gift.type === "diamonds") {
        db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(event.gift.amount, userId);
        logGameEvent(userId, "event_gift", { collectionId: event.id, diamonds: event.gift.amount });
        return;
      }
      const type = event.gift.chestType;
      if (!canStoreChest(type, heldChestCounts(userId), dedicatedSlotsFor(userId))) {
        throw new Error("Ingen ledig kistplats. Öppna en kista först och hämta gåvan sedan.");
      }
      const now = clock.now();
      db.prepare("INSERT INTO chests (id, user_id, type, bought_at, ready_at, payout_table) VALUES (?, ?, ?, ?, ?, ?)")
        .run(crypto.randomUUID(), userId, type, iso(now), iso(now), chestPayouts.current);
      logGameEvent(userId, "event_gift", { collectionId: event.id, quantity: 1 });
    })();
  } catch (err) {
    response.status(400).json({ message: err.message });
    return;
  }
  response.json({ ...buildChestsResponse(userId), state: buildStateResponse(userId) });
});

// One row per live Collection: where its pool stands and how it has been topped up.
function poolSkewRows() {
  const live = livePoolRows();
  return collections.map((collection) => {
    const stats = collectionPoolStats(collection.id);
    const pendingRow = stmtTopUpRow.get(collection.id);
    return {
      collectionId: collection.id,
      label: collection.label ?? collection.id,
      remaining: stats.remaining,
      totalRemaining: stats.total,
      rarePlusShare: stats.share,
      pending: pendingRow?.status === "pending" ? { rare: pendingRow.rare, epic: pendingRow.epic } : null,
      topUps: db.prepare("SELECT * FROM topup_log WHERE collection_id = ? ORDER BY id DESC").all(collection.id).map(topUpLogRow),
      soldOutCards: live
        .filter((r) => r.collection_id === collection.id && r.copies_remaining === 0)
        .map((r) => ({ cardId: r.card_id, rarity: r.rarity })),
    };
  });
}

app.get("/api/admin/pool-skew", requireAdmin, (_request, response) => {
  refreshTopUps();
  response.json({ thresholds: { trigger: TOPUP_TRIGGER, target: TOPUP_TARGET }, collections: poolSkewRows() });
});

function adminBanners() {
  refreshTopUps();
  const banners = [];
  const since = clock.now() - TOPUP_FIRED_BANNER_DAYS * 24 * 60 * 60 * 1000;
  for (const row of db.prepare("SELECT * FROM topups WHERE status = 'pending'").all()) {
    banners.push({ kind: "topup_pending", collectionId: row.collection_id, rare: row.rare, epic: row.epic });
  }
  for (const row of db.prepare("SELECT * FROM topup_log ORDER BY id DESC").all()) {
    if (Date.parse(row.created_at) >= since) {
      banners.push({ kind: "topup_fired", collectionId: row.collection_id, rare: row.rare, epic: row.epic, source: row.source, at: row.created_at });
    }
  }
  const now = clock.now();
  for (const e of allEvents()) {
    const startsIn = Date.parse(e.startsAt) - now;
    if (startsIn > 0 && startsIn <= EVENT_SOON_MS) banners.push({ kind: "event_soon", eventId: e.id, label: e.label, startsAt: e.startsAt });
  }
  for (const collection of collections) {
    const { remaining } = collectionPoolStats(collection.id);
    const totals = new Set(allCards.filter((c) => c.collectionId === collection.id).map((c) => c.rarity));
    for (const rarity of totals) {
      if ((remaining[rarity] ?? 0) === 0) banners.push({ kind: "rarity_sold_out", collectionId: collection.id, rarity });
    }
  }
  return banners;
}

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
    banners: adminBanners(),
  });
});

app.get("/api/admin/users", requireAdmin, (_request, response) => {
  const rows = db.prepare(`
    SELECT u.id, u.username, u.email, u.created_at, u.first_name, u.last_name,
           u.banned_until, u.ban_reason,
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
    bannedUntil: activeBan(r)?.until ?? null,
  })));
});

// Everything about one player in a single call: account, balance, collection,
// chests, achievements, trade history and who they trade with. One round trip
// rather than six, because the whole point is scanning a player at a glance.
app.get("/api/admin/users/:id", requireAdmin, (request, response) => {
  const userId = request.params.id;
  const user = db
    .prepare("SELECT id, username, email, created_at, first_name, last_name, banned_until, ban_reason FROM users WHERE id = ?")
    .get(userId);
  if (!user) { response.status(404).json({ message: "Användaren hittades inte." }); return; }
  const ban = activeBan(user);

  const state = db.prepare("SELECT * FROM player_state WHERE user_id = ?").get(userId);

  const ownedRows = db
    .prepare("SELECT card_id, COUNT(*) AS count FROM owned_cards WHERE user_id = ? GROUP BY card_id")
    .all(userId);
  const available = new Map(availableForTrade(userId).map((r) => [r.cardId, r.quantity]));

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
      bannedUntil: ban?.until ?? null,
      banReason: ban?.reason ?? null,
    },
    state: {
      diamonds: state?.diamonds ?? 0,
      lastDailyClaimDate: state?.last_daily_claim_date ?? null,
      canClaimDailyDiamonds: (state?.last_daily_claim_date ?? null) !== todayIso(),
    },
    totals: {
      totalCards,
      uniqueCards: ownedRows.length,
      markedForTrade: [...available.values()].reduce((sum, n) => sum + n, 0),
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
      markedForTrade: available.get(r.card_id) ?? 0,
    })),
    chests: chestRows.map((row) => publicChest(row, dedicatedSlots.has(row.type) ? row.type : "free")),
    achievements: claimedRows.map((r) => ({
      id: r.achievement_id,
      title: achievementById.get(r.achievement_id)?.title ?? r.achievement_id,
      reward: achievementById.get(r.achievement_id)?.reward ?? null,
      claimedAt: r.claimed_at,
    })),
    trades,
    // Every Diamond movement logged for this player, newest first (grants carry their reason).
    diamondHistory: db
      .prepare("SELECT type, diamonds, reason, created_at FROM game_events WHERE user_id = ? AND diamonds != 0 ORDER BY id DESC LIMIT 200")
      .all(userId)
      .map((r) => ({ type: r.type, diamonds: r.diamonds, reason: r.reason, createdAt: r.created_at })),
    partners: [...partners.values()].sort((a, b) => b.acceptedTrades - a.acceptedTrades),
    packsOpened: db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM packs_opened WHERE user_id = ?").get(userId).n,
    upgrades: db
      .prepare("SELECT * FROM upgrades WHERE user_id = ? ORDER BY created_at DESC")
      .all(userId)
      .map(publicUpgrade),
  });
});

// Every special card in the live catalog with whoever currently owns a copy.
// Special cards are one-offs, so this answers "who has them?" at a glance —
// including cards nobody owns yet (owners: []).
// Temporary ban: read-only access for `days` days. Banning also cancels every
// pending trade the player is part of (sent or received) so nothing can be
// settled with them while they are out; their Behåll settings are kept and their
// Available for Trade Copies are hidden. Re-banning an already-banned player replaces the end date.
const MAX_BAN_DAYS = 365;
app.post("/api/admin/users/:id/ban", requireAdmin, (request, response) => {
  const userId = request.params.id;
  const days = Number(request.body?.days);
  const reason = String(request.body?.reason ?? "").trim().slice(0, 300) || null;
  if (!Number.isFinite(days) || days <= 0 || days > MAX_BAN_DAYS) {
    response.status(400).json({ message: `Ange ett antal dagar mellan 1 och ${MAX_BAN_DAYS}.` });
    return;
  }
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) {
    response.status(404).json({ message: "Användaren hittades inte." });
    return;
  }

  const bannedUntil = new Date(clock.now() + days * 24 * 60 * 60 * 1000).toISOString();
  const cancelledTrades = db.transaction(() => {
    db.prepare("UPDATE users SET banned_until = ?, ban_reason = ? WHERE id = ?").run(bannedUntil, reason, userId);
    return db
      .prepare(
        "UPDATE trades SET status = 'cancelled' WHERE status = 'pending' AND (sender_user_id = ? OR receiver_user_id = ?)",
      )
      .run(userId, userId).changes;
  })();

  response.json({ bannedUntil, reason, cancelledTrades });
});

app.delete("/api/admin/users/:id/ban", requireAdmin, (request, response) => {
  const result = db
    .prepare("UPDATE users SET banned_until = NULL, ban_reason = NULL WHERE id = ?")
    .run(request.params.id);
  if (result.changes === 0) {
    response.status(404).json({ message: "Användaren hittades inte." });
    return;
  }
  response.status(204).end();
});

// ── Admin statistics ─────────────────────────────────────────────────────────

function publicUpgrade(row) {
  return {
    id: row.id,
    collectionId: row.collection_id,
    fromRarity: row.from_rarity,
    toRarity: row.to_rarity,
    consumedCardIds: JSON.parse(row.consumed_card_ids),
    resultCardId: row.result_card_id,
    createdAt: row.created_at,
  };
}

// Calendar day in Swedish time, so "today" in the charts matches the admin's.
function stockholmDay(iso) {
  return new Date(iso).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
}

// ── Diamond economy: flow view and manual grants ───────────────────────────
const DIAMOND_TARGET_PER_ACTIVE_PLAYER = 300;
const FLOW_SOURCE_BY_TYPE = {
  daily: "daily", streak_bonus: "streak", weekly_goal: "weeklyGoals", achievement: "achievements",
  chest_open: "chestPayouts", event_gift: "eventGifts", admin_grant: "adminGrants", starter_step: "starterRewards", comeback_gift: "comebackGifts",
};
const FLOW_SINK_BY_TYPE = { pack: "packs", chest_buy: "chests", slot_buy: "slots" };

// Per Stockholm day: every Diamond source and sink, Diamonds earned per active
// player against the target, and Diamonds moved in Trades (kept apart: a Trade
// only moves Diamonds between players, it neither creates nor destroys any).
// An admin grant does not make a player "active".
app.get("/api/admin/diamond-flow", requireAdmin, (request, response) => {
  const days = Math.min(90, Math.max(7, Number(request.query.days) || 30));
  const DAY = 24 * 60 * 60 * 1000;
  const now = clock.now();
  const zero = (map) => Object.fromEntries(Object.values(map).map((k) => [k, 0]));
  const emptyDay = (date) => ({
    date, sources: zero(FLOW_SOURCE_BY_TYPE), sinks: zero(FLOW_SINK_BY_TYPE),
    earned: 0, spent: 0, tradeDiamonds: 0, activePlayers: new Set(),
  });
  const byDay = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const date = stockholmDay(new Date(now - i * DAY).toISOString());
    byDay.set(date, emptyDay(date));
  }
  const events = db
    .prepare("SELECT user_id, type, diamonds, created_at FROM game_events WHERE created_at >= ?")
    .all(new Date(now - days * DAY).toISOString());
  for (const e of events) {
    const d = byDay.get(stockholmDay(e.created_at));
    if (!d) continue;
    if (e.type !== "admin_grant") d.activePlayers.add(e.user_id);
    if (FLOW_SOURCE_BY_TYPE[e.type]) { d.sources[FLOW_SOURCE_BY_TYPE[e.type]] += e.diamonds; d.earned += e.diamonds; }
    else if (FLOW_SINK_BY_TYPE[e.type]) { d.sinks[FLOW_SINK_BY_TYPE[e.type]] += e.diamonds; d.spent += e.diamonds; }
    else if (e.type === "trade_diamonds") d.tradeDiamonds += e.diamonds;
  }
  const rows = [...byDay.values()].map((d) => {
    const active = d.activePlayers.size;
    return { ...d, activePlayers: active, earnedPerActivePlayer: active ? Math.round(d.earned / active) : null };
  });
  const totals = { sources: zero(FLOW_SOURCE_BY_TYPE), sinks: zero(FLOW_SINK_BY_TYPE), earned: 0, spent: 0, tradeDiamonds: 0 };
  for (const d of rows) {
    for (const k of Object.keys(totals.sources)) totals.sources[k] += d.sources[k];
    for (const k of Object.keys(totals.sinks)) totals.sinks[k] += d.sinks[k];
    totals.earned += d.earned; totals.spent += d.spent; totals.tradeDiamonds += d.tradeDiamonds;
  }
  response.json({ target: DIAMOND_TARGET_PER_ACTIVE_PLAYER, days: rows, totals });
});

// Manual grant of Diamonds to one player. Diamonds only: there is deliberately
// no route for granting Copies, which are finite (see the Card pool).
const MAX_GRANT = 100000;
app.post("/api/admin/users/:id/grant-diamonds", requireAdmin, (request, response) => {
  const userId = request.params.id;
  const amount = Number(request.body?.amount);
  const reason = String(request.body?.reason ?? "").trim().slice(0, 300);
  if (!db.prepare("SELECT 1 FROM users WHERE id = ?").get(userId)) {
    response.status(404).json({ message: "Användaren hittades inte." }); return;
  }
  if (!Number.isInteger(amount) || amount <= 0 || amount > MAX_GRANT) {
    response.status(400).json({ message: `Ange ett heltal mellan 1 och ${MAX_GRANT}.` }); return;
  }
  if (!reason) { response.status(400).json({ message: "Ange en orsak." }); return; }
  db.transaction(() => {
    ensurePlayerState(userId);
    db.prepare("UPDATE player_state SET diamonds = diamonds + ? WHERE user_id = ?").run(amount, userId);
    logGameEvent(userId, "admin_grant", { diamonds: amount, reason });
  })();
  response.json({ diamonds: db.prepare("SELECT diamonds FROM player_state WHERE user_id = ?").get(userId).diamonds });
});

// Everything for the "Statistik" tab in one call. Computed on demand — the
// tables are small, and an on-demand report can never be stale. Upgrades and
// game_events only exist from the release that introduced them, so `since`
// tells the UI from when those numbers are complete.
app.get("/api/admin/stats", requireAdmin, (request, response) => {
  const days = Math.min(90, Math.max(7, Number(request.query.days) || 30));
  const now = clock.now();
  const DAY = 24 * 60 * 60 * 1000;
  const windowStart = new Date(now - days * DAY).toISOString();
  const weekStart = new Date(now - 7 * DAY).toISOString();
  const today = stockholmDay(new Date(now).toISOString());

  const users = db.prepare("SELECT id, username, created_at, banned_until FROM users").all();
  const usernameById = new Map(users.map((u) => [u.id, u.username]));
  const events = db.prepare("SELECT user_id, type, quantity, diamonds, created_at FROM game_events WHERE created_at >= ?").all(windowStart);
  const upgradesInWindow = db.prepare("SELECT user_id, created_at FROM upgrades WHERE created_at >= ?").all(windowStart);
  const tradesInWindow = db.prepare("SELECT sender_user_id, status, created_at FROM trades WHERE created_at >= ?").all(windowStart);

  // ── Daily series (oldest first) ──
  const daily = new Map();
  for (let i = days - 1; i >= 0; i--) {
    const day = stockholmDay(new Date(now - i * DAY).toISOString());
    daily.set(day, { date: day, signups: 0, activePlayers: new Set(), packs: 0, upgrades: 0, trades: 0 });
  }
  const bucket = (iso) => daily.get(stockholmDay(iso));
  for (const u of users) { const b = bucket(u.created_at); if (b) b.signups++; }
  for (const e of events) {
    const b = bucket(e.created_at);
    if (!b) continue;
    b.activePlayers.add(e.user_id);
    if (e.type === "pack") b.packs += e.quantity;
  }
  for (const u of upgradesInWindow) {
    const b = bucket(u.created_at);
    if (b) { b.upgrades++; b.activePlayers.add(u.user_id); }
  }
  for (const t of tradesInWindow) {
    const b = bucket(t.created_at);
    if (b) { b.trades++; b.activePlayers.add(t.sender_user_id); }
  }

  // "Active" = did anything logged: an economy event, an upgrade or sent a trade.
  // Today's count also includes anyone whose daily-diamond claim is dated today,
  // which works even before game_events existed.
  const activeIn = (sinceIso) => {
    const ids = new Set();
    for (const e of events) if (e.created_at >= sinceIso) ids.add(e.user_id);
    for (const u of upgradesInWindow) if (u.created_at >= sinceIso) ids.add(u.user_id);
    for (const t of tradesInWindow) if (t.created_at >= sinceIso) ids.add(t.sender_user_id);
    return ids;
  };
  const activeToday = new Set([...(daily.get(today)?.activePlayers ?? [])]);
  for (const r of db.prepare("SELECT user_id FROM player_state WHERE last_daily_claim_date = ?").all(todayIso())) {
    activeToday.add(r.user_id);
  }

  // ── Totals ──
  const tradeCounts = Object.fromEntries(
    db.prepare("SELECT status, COUNT(*) AS n FROM trades GROUP BY status").all().map((r) => [r.status, r.n]),
  );
  const accepted = tradeCounts.accepted ?? 0;
  const rejected = tradeCounts.rejected ?? 0;
  const packsOpened = db.prepare("SELECT COALESCE(SUM(count), 0) AS n FROM packs_opened").get().n;
  const diamondRow = db.prepare("SELECT COALESCE(SUM(diamonds), 0) AS total FROM player_state").get();

  const totals = {
    players: users.length,
    newPlayers7d: users.filter((u) => u.created_at >= weekStart).length,
    activeToday: activeToday.size,
    active7d: activeIn(weekStart).size,
    bannedNow: users.filter((u) => activeBan(u)).length,
    packsOpened,
    packsPerPlayer: users.length ? Math.round((packsOpened / users.length) * 10) / 10 : 0,
    upgrades: db.prepare("SELECT COUNT(*) AS n FROM upgrades").get().n,
    trades: Object.values(tradeCounts).reduce((a, b) => a + b, 0),
    tradesAccepted: accepted,
    tradesPending: tradeCounts.pending ?? 0,
    // Of the offers someone actually answered, how many were accepted.
    acceptanceRate: accepted + rejected > 0 ? Math.round((accepted / (accepted + rejected)) * 100) : null,
    diamondsInCirculation: diamondRow.total,
    cardsOwned: db.prepare("SELECT COUNT(*) AS n FROM owned_cards").get().n,
  };

  // ── Diamond flow in the window ──
  const flow = { daily: 0, eventGifts: 0, streakBonus: 0, weeklyGoals: 0, achievements: 0, chestRewards: 0, starterRewards: 0, comebackGifts: 0, packs: 0, chests: 0, slots: 0 };
  for (const e of events) {
    if (e.type === "daily") flow.daily += e.diamonds;
    else if (e.type === "event_gift") flow.eventGifts += e.diamonds;
    else if (e.type === "streak_bonus") flow.streakBonus += e.diamonds;
    else if (e.type === "weekly_goal") flow.weeklyGoals += e.diamonds;
    else if (e.type === "achievement") flow.achievements += e.diamonds;
    else if (e.type === "chest_open") flow.chestRewards += e.diamonds;
    else if (e.type === "starter_step") flow.starterRewards += e.diamonds;
    else if (e.type === "comeback_gift") flow.comebackGifts += e.diamonds;
    else if (e.type === "pack") flow.packs += e.diamonds;
    else if (e.type === "chest_buy") flow.chests += e.diamonds;
    else if (e.type === "slot_buy") flow.slots += e.diamonds;
  }

  // ── Upgrades by tier (all time) ──
  const tierCounts = new Map(
    db.prepare("SELECT from_rarity, COUNT(*) AS n FROM upgrades GROUP BY from_rarity").all().map((r) => [r.from_rarity, r.n]),
  );
  const upgradesByTier = Object.entries(TIER_UPGRADE_TARGET).map(([from, to]) => ({
    from, to, count: tierCounts.get(from) ?? 0, cardsPerUpgrade: UPGRADE_CARDS_REQUIRED[from],
  }));

  // ── Leaderboards (top 10) ──
  const withName = (rows) => rows.map((r) => ({ id: r.user_id, username: usernameById.get(r.user_id) ?? "?", value: r.n }));
  const liveCardCount = allCards.length;
  const leaders = {
    packs: withName(db.prepare(
      "SELECT user_id, SUM(count) AS n FROM packs_opened GROUP BY user_id ORDER BY n DESC LIMIT 10",
    ).all()),
    upgrades: withName(db.prepare(
      "SELECT user_id, COUNT(*) AS n FROM upgrades GROUP BY user_id ORDER BY n DESC LIMIT 10",
    ).all()),
    trades: withName(db.prepare(`
      SELECT user_id, COUNT(*) AS n FROM (
        SELECT sender_user_id AS user_id FROM trades WHERE status = 'accepted'
        UNION ALL
        SELECT receiver_user_id FROM trades WHERE status = 'accepted'
      ) GROUP BY user_id ORDER BY n DESC LIMIT 10
    `).all()),
    diamonds: withName(db.prepare(
      "SELECT user_id, diamonds AS n FROM player_state ORDER BY diamonds DESC LIMIT 10",
    ).all()),
    // Unique cards owned, counted against the live catalog only.
    collection: (() => {
      const counts = new Map();
      for (const r of db.prepare("SELECT DISTINCT user_id, card_id FROM owned_cards").all()) {
        if (cardById.has(r.card_id)) counts.set(r.user_id, (counts.get(r.user_id) ?? 0) + 1);
      }
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([id, n]) => ({
          id, username: usernameById.get(id) ?? "?", value: n,
          percent: liveCardCount ? Math.round((n / liveCardCount) * 1000) / 10 : 0,
        }));
    })(),
  };

  // ── Most-owned non-common cards ──
  const topCards = db.prepare(`
    SELECT oc.card_id, COUNT(*) AS copies, COUNT(DISTINCT oc.user_id) AS owners
    FROM owned_cards oc
    JOIN card_pool p ON p.card_id = oc.card_id
    WHERE p.rarity != 'common'
    GROUP BY oc.card_id ORDER BY copies DESC LIMIT 10
  `).all().filter((r) => cardById.has(r.card_id)).map((r) => ({
    cardId: r.card_id, rarity: cardById.get(r.card_id).rarity, copies: r.copies, owners: r.owners,
  }));

  const soldOut = livePoolRows().filter((r) => r.copies_remaining <= 0).length;

  const recentUpgrades = db
    .prepare("SELECT * FROM upgrades ORDER BY created_at DESC LIMIT 50")
    .all()
    .map((r) => ({ ...publicUpgrade(r), user: { id: r.user_id, username: usernameById.get(r.user_id) ?? "?" } }));

  response.json({
    days,
    since: {
      upgrades: db.prepare("SELECT MIN(created_at) AS t FROM upgrades").get().t,
      events: db.prepare("SELECT MIN(created_at) AS t FROM game_events").get().t,
    },
    totals,
    daily: [...daily.values()].map((d) => ({ ...d, activePlayers: d.activePlayers.size })),
    diamondFlow: flow,
    upgradesByTier,
    leaders,
    topCards,
    soldOutCards: soldOut,
    recentUpgrades,
  });
});

app.get("/api/admin/special-cards", requireAdmin, (_request, response) => {
  const ownersStmt = db.prepare(`
    SELECT u.id, u.username, u.first_name, u.last_name, COUNT(*) AS n
    FROM owned_cards oc
    JOIN users u ON u.id = oc.user_id
    WHERE oc.card_id = ?
    GROUP BY u.id
    ORDER BY u.username COLLATE NOCASE
  `);
  const rows = livePoolRows().filter((r) => r.rarity === "special");
  response.json(rows.map((r) => ({
    cardId: r.card_id,
    collectionId: r.collection_id,
    total: r.total_copies,
    remaining: r.copies_remaining,
    owners: ownersStmt.all(r.card_id).map((o) => ({
      id: o.id,
      username: o.username,
      firstName: o.first_name ?? null,
      lastName: o.last_name ?? null,
      count: o.n,
    })),
  })));
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
    db.prepare("DELETE FROM kept_cards WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM chests WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM chest_slots WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM chest_type_slots WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM achievement_claims WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM packs_opened WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM upgrades WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM game_events WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM password_reset_tokens WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM trades WHERE sender_user_id = ? OR receiver_user_id = ?").run(userId, userId);
    db.prepare("DELETE FROM player_state WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM comeback_state WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM starter_claims WHERE user_id = ?").run(userId);
    db.prepare("DELETE FROM starter_state WHERE user_id = ?").run(userId);
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
  const createdAt = new Date(clock.now()).toISOString();
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

const distPath = config.distPath;
app.use(express.static(distPath));
app.get(/^(?!\/api\/).*/, (_request, response) => {
  response.sendFile(path.join(distPath, "index.html"));
});

// ── Start ─────────────────────────────────────────────────────────────────────

function startBackgroundJobs() {
  const timers = [
    setInterval(() => applyEventChestCaps(), 60 * 1000).unref(),
    setInterval(() => { try { startDueEvents(); } catch (err) { console.error(err); } }, 60 * 1000).unref(),
    setInterval(settleWeeklyGoals, 60 * 1000).unref(),
    setInterval(clearOldTradeHistory, TRADE_CLEANUP_INTERVAL_MS).unref(),
  ];
  return () => timers.forEach(clearInterval);
}

return { app, startBackgroundJobs };
}
