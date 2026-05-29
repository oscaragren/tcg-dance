/**
 * Scrapes SM 2026 start lists and outputs card definitions.
 *
 * Sources:
 *   Comp 4026: Senior/Grand Senior Bugg, BW Junior/Vuxen, Lindy Hop, Rock'n'Roll
 *   Comp 4027: Bugg Junior/Vuxen, Dubbelbugg, BW Senior/Grand Senior,
 *              Lindy Hop, Rock'n'Roll, Rullstolsbugg
 *
 * Usage:
 *   node scripts/scrape-sm2026-startlist.mjs
 *   node scripts/scrape-sm2026-startlist.mjs --out ./data/sm2026-cards.json
 */

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const io = require('socket.io-client');

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_URL = 'https://api.vote4dance.com';
const COMP_IDS = ['4026', '4027'];
const COLLECTION_ID = 'sm2026';
const DEFAULT_OUT = resolve(__dirname, '../data/sm2026-cards.json');

function parseArgs(argv) {
  const out = { out: DEFAULT_OUT };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--out') out.out = resolve(process.cwd(), argv[++i]);
  }
  return out;
}

function extractConnectSid(headers) {
  const list =
    typeof headers.getSetCookie === 'function'
      ? headers.getSetCookie()
      : [headers.get('set-cookie')].filter(Boolean);
  const blob = list.join('; ');
  const m = /connect\.sid=([^;]+)/.exec(blob);
  if (!m) throw new Error('No connect.sid in /token response.');
  return decodeURIComponent(m[1].trim());
}

async function fetchSid() {
  const res = await fetch(`${API_URL}/token`);
  if (!res.ok) throw new Error(`Token request failed: ${res.status}`);
  return extractConnectSid(res.headers);
}

function tabularToObjects(tab) {
  return tab.rows.map((row) => Object.fromEntries(tab.keys.map((k, i) => [k, row[i]])));
}

function streamSubscribe(socket, url) {
  return new Promise((resolve, reject) => {
    socket.emit('stream', { url }, (err, payload) => {
      if (err) reject(new Error(typeof err === 'string' ? err : JSON.stringify(err)));
      else resolve(payload);
    });
  });
}

function classLabelToDanceStyle(label) {
  const l = label.toLowerCase();
  if (l.includes('rullstols') && l.includes('funktionsklass 1')) return 'Rullstolsdans Combi 1';
  if (l.includes('rullstols') && l.includes('funktionsklass 2')) return 'Rullstolsdans Combi 2';
  if (l.includes('dubbelbugg')) return 'Dubbelbugg';
  if (l.includes('boogie woogie')) return 'Boogie Woogie';
  if (l.includes('lindy hop')) return 'Lindy Hop';
  if (l.includes("rock'n'roll") || l.includes('rocknroll') || l.includes('rock n roll')) return "Rock'n'Roll";
  if (l.includes('bugg')) return 'Bugg';
  return null;
}

function isKval(label) {
  return /kval/i.test(label);
}

function coupleName(t) {
  const n1 = (t.team_name_1 || '').trim();
  const n2 = (t.team_name_2 || '').trim();
  const n3 = (t.team_name_3 || '').trim();
  if (n1 && n2 && n3) return `${n1}, ${n2} & ${n3}`;
  if (n1 && n2) return `${n1} & ${n2}`;
  return n1 || n2;
}

async function main() {
  const opts = parseArgs(process.argv);
  console.log('Fetching session token...');
  const sid = await fetchSid();

  const socket = io(API_URL, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    query: { 'connect.sid': sid },
  });

  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('connect_error', reject);
  });
  console.log('Connected via Socket.IO\n');

  const cards = [];
  const seen = new Map(); // key: "name|danceStyle" → card id

  for (const compId of COMP_IDS) {
    // 1. Fetch all classes
    const classesRes = await streamSubscribe(socket, `/classes/${compId}`);
    const classes = tabularToObjects(classesRes.data);

    const nonKvalClasses = classes.filter((c) => {
      const label = c.class_label || '';
      if (!label || label === '.') return false;
      if (isKval(label)) {
        console.log(`  SKIP (Kval): ${label}`);
        return false;
      }
      return true;
    });

    console.log(`Comp ${compId}: ${classes.length} classes → ${nonKvalClasses.length} non-Kval`);

    // 2. For each non-Kval class, fetch its teams
    for (const cls of nonKvalClasses) {
      const danceStyle = classLabelToDanceStyle(cls.class_label);
      if (!danceStyle) {
        console.log(`  SKIP (unknown style): ${cls.class_label}`);
        continue;
      }

      const teamsRes = await streamSubscribe(socket, `/class-teams/${cls.class_id}`);
      const teams = tabularToObjects(teamsRes.data);
      console.log(`  ${cls.class_label} → ${danceStyle} (${teams.length} teams)`);

      for (const team of teams) {
        const name = coupleName(team);
        if (!name) continue;

        const dedupeKey = `${name.toLowerCase()}|${danceStyle}`;
        if (seen.has(dedupeKey)) {
          // Same couple competing in two classes of the same dance style — skip duplicate
          continue;
        }

        const card = {
          id: `sm26-${team.team_id}`,
          name,
          rarity: 'common',
          collectionId: COLLECTION_ID,
          club: (team.team_org || '').trim() || undefined,
          danceStyle,
        };
        // Remove undefined fields
        if (!card.club) delete card.club;

        seen.set(dedupeKey, card.id);
        cards.push(card);
      }
    }
    console.log();
  }

  socket.close();

  const output = {
    scrapedAt: new Date().toISOString(),
    source: {
      compIds: COMP_IDS,
      apiBase: API_URL,
    },
    cards,
  };

  writeFileSync(opts.out, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nWrote ${cards.length} cards to ${opts.out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
