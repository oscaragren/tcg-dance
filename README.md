# TCG Dance

A trading card game built around competitive bugg (swing dance) couples from the Swedish ranking on [Vote4Dance](https://vote4dance.com). Players collect cards representing real dance couples, earn diamonds daily, and spend them on packs.

## Features

- **Auth** — register, login, and logout with JWT session cookies
- **Card collection** — browse owned cards, filter by rarity, toggle to see all cards
- **Diamond wallet** — earn 150 diamonds per day; spend them on packs
- **Pack shop** — three pack tiers (Bronspack, Silverpack, Guldpack) with different card counts, rarity odds, and prices
- **Gallery** — public view of all available cards, sortable by ranking or name
- **Card designs** — a subset of top couples have custom photo artwork; all others render with a rarity-coloured gradient frame

## Project structure

```
├── data/
│   ├── tcg.db                      # SQLite database (created on first server start)
│   ├── game-content.json           # Pack configs, rarity chances, prices, daily diamond reward
│   ├── vote4dance-ranking.json     # Latest scraped V4D ranking snapshot
│   ├── designs/                    # Card artwork PNGs (firstname_lastname-firstname_lastname)
│   ├── users.json                  # Legacy — migrated to DB on first run, no longer written
│   └── player-state.json           # Legacy — migrated to DB on first run, no longer written
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
    │   ├── card/App.tsx            # Standalone card viewer app (dev/design use)
    │   └── web/                    # Main web app
    │       ├── App.tsx             # Root: session state, routing
    │       ├── AuthPage.tsx        # Register / login form
    │       ├── LoggedInHomePage.tsx # Diamond wallet, daily claim, pack shop, last opened
    │       ├── CollectionPage.tsx  # Owned card grid with rarity filter
    │       └── GalleryPage.tsx     # All cards, public, sortable/filterable
    │
    ├── components/
    │   ├── game/TradingCard.tsx    # Full FIFA-style card component (not yet used in live UI)
    │   ├── web/                    # Page-level components (Hero, Header, Footer, …)
    │   └── shared/ui/              # shadcn/ui component library
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
