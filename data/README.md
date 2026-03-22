# Data files

## `vote4dance-ranking.json`

Snapshot of a **Vote4Dance** public ranking, produced by running:

```bash
npm run scrape:vote4dance
```

(or `node scripts/scrape-vote4dance-ranking.mjs` with optional `--federation`, `--division`, `--ranking`, `--out`).

The scraper uses Vote4Dance’s API (Socket.IO streams), not HTML scraping. Rows can change whenever the organiser updates results.

### What’s included

Only couples in the **medal leagues** shown on the site as **Guld**, **Silver**, and **Brons** (gold / silver / bronze). Other leagues, if any, are omitted.

### Top-level fields

| Field | Meaning |
|--------|--------|
| `scrapedAt` | ISO 8601 timestamp when the file was written. |
| `source` | Where this snapshot came from. |
| `leagues` | The three medal leagues for this ranking (ids, names, display order, UI colour hint). |
| `couples` | List of couples in those leagues, sorted by tier (Guld → Silver → Brons), then ranking. |
| `lines` | Human-readable strings: `"[Guld] First Last & First Last (CLUB)"` — same info as `couples`, easy to grep or paste. |

### `source`

| Field | Meaning |
|--------|--------|
| `publicUrl` | Browser URL for the same ranking on vote4dance.com. |
| `apiBase` | API host used to fetch data (default `https://api.vote4dance.com`). |
| `federationId`, `divisionId`, `rankingId` | Path segments for that ranking in the API and public URL. |

### `leagues[]`

| Field | Meaning |
|--------|--------|
| `leagueId` | Internal league id (e.g. Guld is often `"4"` for this ranking; ids are not guaranteed across all events). |
| `name` | `Guld`, `Silver`, or `Brons`. |
| `order` | Sort order on the site (0 = first trophy block). |
| `color` | Hex colour (no `#`) used in the UI for that league. |

### `couples[]`

| Field | Meaning |
|--------|--------|
| `tier` | Same as league display name: `Guld`, `Silver`, or `Brons`. |
| `leagueId` | League this couple belongs to; matches `leagues[].leagueId`. |
| `teamName` | Full label from Vote4Dance: `Leader & Partner (CLUB)` — club(s) in parentheses, sometimes several codes separated by `/`. |
| `rankingPosition` | Published placement within the tier (ties can share the same position). |
| `rankingOrder` | Tie-break / list order when positions are equal. |
| `danceTeamId` | Stable id for the couple in Vote4Dance. |
| `rankingScoreSum` | Total score used for this ranking (number). |

### Regenerating

The JSON is not updated automatically. Run the scraper again after competitions or corrections to refresh the file.

### Federation
DSF = 3
Bugg Vuxen = 3
