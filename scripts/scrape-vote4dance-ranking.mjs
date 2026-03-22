/**
 * Fetches Vote4Dance ranking data (Guld / Silver / Brons couples only)
 * via the same Socket.IO stream the public site uses.
 *
 * Usage:
 *   node scripts/scrape-vote4dance-ranking.mjs
 *   node scripts/scrape-vote4dance-ranking.mjs --federation 3 --division 13 --ranking 2
 *   node scripts/scrape-vote4dance-ranking.mjs --out ./data/my-ranking.json
 */

import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const io = require('socket.io-client');

const __dirname = dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUT = resolve(__dirname, '../data/vote4dance-ranking.json');

function parseArgs(argv) {
  const out = { federation: '3', division: '13', ranking: '2', apiUrl: 'https://api.vote4dance.com', out: DEFAULT_OUT };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--federation') out.federation = argv[++i];
    else if (a === '--division') out.division = argv[++i];
    else if (a === '--ranking') out.ranking = argv[++i];
    else if (a === '--api') out.apiUrl = argv[++i].replace(/\/$/, '');
    else if (a === '--out') out.out = resolve(process.cwd(), argv[++i]);
    else if (a === '--help' || a === '-h') {
      console.log(`Usage: node scripts/scrape-vote4dance-ranking.mjs [options]

Options:
  --federation <id>   Default: 3
  --division <id>     Default: 13
  --ranking <id>      Default: 2
  --api <url>         Default: https://api.vote4dance.com
  --out <path>        Output JSON file (default: data/vote4dance-ranking.json)
`);
      process.exit(0);
    }
  }
  return out;
}

/** @param {Headers} headers */
function extractConnectSid(headers) {
  const list =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
  const blob = list.join('; ');
  const m = /connect\.sid=([^;]+)/.exec(blob);
  if (!m) throw new Error('No connect.sid cookie in /token response.');
  return decodeURIComponent(m[1].trim());
}

async function fetchSessionId(apiUrl) {
  const res = await fetch(`${apiUrl}/token`);
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  return extractConnectSid(res.headers);
}

function tabularToObjects(tab) {
  const keys = tab.keys;
  return tab.rows.map((row) => Object.fromEntries(keys.map((k, i) => [k, row[i]])));
}

function streamSubscribe(socket, url) {
  return new Promise((resolve, reject) => {
    socket.emit('stream', { url }, (err, payload) => {
      if (err) reject(err);
      else resolve(payload);
    });
  });
}

async function main() {
  const opts = parseArgs(process.argv);
  const sid = await fetchSessionId(opts.apiUrl);

  const socket = io(opts.apiUrl, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    query: { 'connect.sid': sid },
  });

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });

  const fed = opts.federation;
  const div = opts.division;
  const rank = opts.ranking;
  const prefix = `/federations/${fed}/divisions/${div}/rankings/${rank}`;

  const [leaguesRes, teamsRes] = await Promise.all([
    streamSubscribe(socket, `${prefix}/leagues`),
    streamSubscribe(socket, `${prefix}/teams`),
  ]);

  socket.close();

  const leagueRows = tabularToObjects(leaguesRes.data);
  const tierByLeagueId = {};
  const medalLeagueIds = new Set();
  const tierOrder = { Guld: 0, Silver: 1, Brons: 2 };

  for (const row of leagueRows) {
    const name = String(row.league_name ?? '');
    if (name === 'Guld' || name === 'Silver' || name === 'Brons') {
      const id = String(row.league_id);
      medalLeagueIds.add(id);
      tierByLeagueId[id] = name;
    }
  }

  const teamRows = tabularToObjects(teamsRes.data);
  const couples = teamRows
    .filter((r) => medalLeagueIds.has(String(r.league_id)))
    .map((r) => {
      const tier = tierByLeagueId[String(r.league_id)] ?? 'Unknown';
      return {
        tier,
        leagueId: String(r.league_id),
        teamName: String(r.team_name ?? ''),
        rankingPosition: Number(r.ranking_team_position),
        rankingOrder: Number(r.ranking_team_order),
        danceTeamId: String(r.dance_team_id ?? ''),
        rankingScoreSum: r.ranking_score_sum,
      };
    })
    .sort((a, b) => {
      if (tierOrder[a.tier] !== tierOrder[b.tier]) return tierOrder[a.tier] - tierOrder[b.tier];
      if (a.rankingPosition !== b.rankingPosition) return a.rankingPosition - b.rankingPosition;
      return a.rankingOrder - b.rankingOrder;
    });

  const publicUrl = `https://vote4dance.com/public/federation/${fed}/division/${div}/ranking/${rank}`;

  const output = {
    scrapedAt: new Date().toISOString(),
    source: {
      publicUrl,
      apiBase: opts.apiUrl,
      federationId: fed,
      divisionId: div,
      rankingId: rank,
    },
    leagues: leagueRows
      .filter((r) => medalLeagueIds.has(String(r.league_id)))
      .map((r) => ({
        leagueId: String(r.league_id),
        name: r.league_name,
        order: r.league_order,
        color: r.league_color,
      })),
    couples,
    lines: couples.map((c) => `[${c.tier}] ${c.teamName}`),
  };

  mkdirSync(dirname(opts.out), { recursive: true });
  writeFileSync(opts.out, JSON.stringify(output, null, 2), 'utf8');
  console.log(`Wrote ${couples.length} couples (Guld/Silver/Brons) to ${opts.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
