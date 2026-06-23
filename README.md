# TCG Dance

A trading card game built around competitive bugg (swing dance) couples from the Swedish ranking on [Vote4Dance](https://vote4dance.com). Players collect cards representing real dance couples, earn diamonds daily, and spend them on packs.

## Features

- **Auth** — register, login, and logout with JWT session cookies
- **Card collection** — browse owned cards, filter by rarity, toggle to see all cards
- **Diamond wallet** — earn 150 diamonds per day; spend them on packs
- **Pack shop** — three pack tiers (Bronspack, Silverpack, Guldpack) with different card counts, rarity odds, and prices
- **Trading** — mark cards for trade and exchange cards/diamonds with other players
- **Achievements** — claim diamond rewards for collection milestones
- **Card designs** — a subset of top couples have custom photo artwork; all others render with a rarity-coloured gradient frame

## Project structure

```
├── data/
│   ├── tcg.db                      # SQLite database (created on first server start; gitignored)
│   ├── game-content.json           # Pack configs, rarity chances, prices, daily diamond reward
│   ├── vote4dance-ranking.json     # Latest scraped V4D ranking snapshot
│   ├── designs/                    # Card artwork JPGs (ID-keyed), bundled at build time
│   └── carousel/                   # Hero carousel images
│
├── scripts/
│   └── scrape-vote4dance-ranking.mjs   # Fetches the latest ranking from Vote4Dance
│
├── server/
│   ├── index.mjs                   # Express server — auth + game API routes
│   ├── db.mjs                      # SQLite init, schema, one-time JSON migration
│   └── gameCatalog.mjs             # Builds the card catalog from ranking + game-content
│
└── src/
    ├── apps/
    │   └── web/                    # Main web app
    │       ├── App.tsx             # Root: session state, routing
    │       ├── AuthPage.tsx        # Register / login form
    │       ├── LoggedInHomePage.tsx # Diamond wallet, daily claim, pack shop, last opened
    │       ├── CollectionPage.tsx  # Owned card grid with rarity filter
    │       ├── TradePage.tsx       # Trade overview, new trades, mark-for-trade
    │       └── UpgradePage.tsx     # Combine 10 cards into a higher rarity
    │
    ├── components/
    │   ├── web/                    # Page-level components (Hero, Header, Footer, …)
    │   └── shared/ui/              # shadcn/ui primitives in use (badge, button, card, input, tabs)
    │
    ├── data/
    │   ├── cards.ts                # Card catalog (built from ranking JSON at bundle time)
    │   ├── buildCardCatalog.ts     # Rarity-from-position logic, catalog builder
    │   ├── packs.ts                # Pack configs + dailyDiamonds re-exported for UI
    │   └── cardDesignUrls.ts       # Resolves design key → bundled image URL
    │
    ├── types/
    │   ├── auth.ts                 # AuthUser
    │   ├── danceCard.ts            # DanceCard, CardRarity, rarityOrder
    │   └── game.ts                 # GameState, BuyPackResponse, ClaimDailyDiamondsResponse
    │
    └── utils/
        ├── authApi.ts              # register, login, logout, fetchCurrentUser
        └── gameApi.ts              # fetchGameState, claimDailyDiamonds, buyPack
```

## Database schema

Three tables in `data/tcg.db`:

| Table | Key columns |
|---|---|
| `users` | `id`, `username`, `email`, `password_hash`, `created_at` |
| `player_state` | `user_id` (FK), `diamonds`, `last_daily_claim_date`, `last_opened_cards` (JSON) |
| `owned_cards` | `user_id` (FK), `card_id` — one row per card instance (duplicates allowed) |

WAL mode is enabled. Foreign keys are enforced.

## Card catalog

Cards are generated at build time from `data/vote4dance-ranking.json`. Rarity is assigned by ranking position:

| Position | Rarity |
|---|---|
| 1 – 5 | Legendary |
| 6 – 15 | Epic |
| 16 – 40 | Rare |
| 41+ | Common |

Only couples in the Guld, Silver, and Brons medal leagues are included.

## Pack configuration

Configured in `data/game-content.json`:

| Pack | Cards | Price | Legendary | Epic | Rare | Common |
|---|---|---|---|---|---|---|
| Bronspack | 10 | 100 ◆ | 3% | 12% | 30% | 55% |
| Silverpack | 10 | 250 ◆ | 6% | 20% | 34% | 40% |
| Guldpack | 10 | 500 ◆ | 10% | 28% | 37% | 25% |

Daily diamond reward: **150 ◆**

## Development

### Prerequisites

```
Node.js 18+
```

### Install

```bash
npm install
```

### Run

Start both the API server and the Vite dev server:

```bash
# Terminal 1 — API (port 4000)
npm run dev:api

# Terminal 2 — Frontend (port 5173)
npm run dev
```

The Vite dev server proxies all `/api/*` requests to port 4000.

On first start, `server/db.mjs` creates `data/tcg.db` and migrates any existing data from the legacy JSON files.

### Update the ranking

```bash
npm run scrape:vote4dance
```

Fetches the latest Bugg Vuxen ranking from Vote4Dance (federation 3, division 13, ranking 2) and overwrites `data/vote4dance-ranking.json`. Restart the frontend build (or dev server) after scraping to pick up rarity changes.

### Build

```bash
npm run build
```

Output goes to `dist/`. The ranking JSON is bundled at build time, so rebuild after scraping.

## Deployment

In production the app runs as a **single Node process**: the Express server in `server/index.mjs` serves both the JSON API (`/api/*`) and the built frontend from `dist/` (with an SPA fallback for non-`/api` routes). The frontend calls the API via relative paths, so everything is same-origin — no CORS or cross-host cookie setup needed.

### Production scripts

```bash
npm run build   # tsc + vite build → dist/
npm run start   # node server/index.mjs (serves dist/ + API)
```

`npm run start` reads configuration from real environment variables (no `--env-file`).

### Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `PORT` | host-injected | Port to listen on (falls back to `AUTH_API_PORT`, then `4000`) |
| `NODE_ENV` | yes | Set to `production` to enable secure cookies and the JWT-secret guard |
| `AUTH_JWT_SECRET` | yes (prod) | Signing secret for session JWTs; the server refuses to boot in production without it. Generate with `openssl rand -hex 32` |
| `DB_PATH` | recommended | Absolute path to the SQLite file (e.g. a mounted volume at `/data/tcg.db`). Defaults to `data/tcg.db` |
| `APP_URL` | yes | Public base URL, used to build password-reset email links |
| `AUTH_CORS_ORIGIN` | optional | Allowed CORS origin; set to the public URL. Mostly moot under same-origin serving |
| `RESEND_API_KEY` | for email | Resend API key for password-reset emails |
| `MAIL_FROM` | for email | Verified sender address (see note below) |

The server runs behind a reverse proxy (`trust proxy` is enabled) so secure cookies work correctly over HTTPS.

### Persistent database

`data/tcg.db` (and its `-wal` / `-shm` files) are **gitignored** — they are not shipped with the repo. In production, point `DB_PATH` at a persistent volume so user data survives redeploys. The schema is created automatically on first start.

### Railway

The repo deploys cleanly on Railway from GitHub. Nixpacks auto-detects the Node project and runs `npm run build` then `npm run start`. Attach a **Volume** mounted at `/data`, set `DB_PATH=/data/tcg.db`, and configure the environment variables above. Watch the logs for `Card pool ready — …` and `Server listening on …` to confirm a clean boot.

> **Email caveat:** Resend's default `onboarding@resend.dev` sender only delivers to the Resend account owner's own verified address. Forgot-password emails to other users will silently fail until you verify a custom sending domain in Resend and set `MAIL_FROM` to use it.
