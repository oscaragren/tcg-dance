import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");

function rarityFromRankingPosition(position) {
  const pos = Number(position);
  if (!Number.isFinite(pos) || pos < 1) {
    return "common";
  }
  if (pos <= 5) {
    return "legendary";
  }
  if (pos <= 15) {
    return "epic";
  }
  if (pos <= 40) {
    return "rare";
  }
  return "common";
}

function buildCardCatalog(gameContent, ranking) {
  const bench = Array.isArray(gameContent.commonBenchCards) ? gameContent.commonBenchCards : [];
  const fromRanking = [];

  function normalizeTeamLabel(raw) {
    const withoutTier = String(raw ?? "").replace(/^\s*\[[^\]]+\]\s*/, "").trim();
    const m = /\s*\(([^)]+)\)\s*$/.exec(withoutTier);
    if (!m) return { teamName: withoutTier, club: null };
    const club = m[1].trim();
    const teamName = withoutTier.slice(0, m.index).trim();
    return { teamName, club: club || null };
  }

  if (ranking?.couples && Array.isArray(ranking.couples)) {
    for (const row of ranking.couples) {
      if (row.danceTeamId == null || !row.teamName) {
        continue;
      }
      const rarity = rarityFromRankingPosition(row.rankingPosition);
      const normalized = normalizeTeamLabel(row.teamName);
      fromRanking.push({
        id: `v4d-${String(row.danceTeamId)}`,
        name: normalized.teamName,
        rarity,
      });
    }
  }

  const byId = new Map();
  for (const card of fromRanking) {
    byId.set(card.id, card);
  }
  for (const card of bench) {
    if (!byId.has(card.id)) {
      byId.set(card.id, card);
    }
  }

  return Array.from(byId.values());
}

export async function loadGameCatalog() {
  const gamePath = path.join(workspaceRoot, "data", "game-content.json");
  const rankingPath = path.join(workspaceRoot, "data", "vote4dance-ranking.json");

  const gameRaw = await fs.readFile(gamePath, "utf8");
  const gameContent = JSON.parse(gameRaw);

  let ranking = null;
  try {
    const rankingRaw = await fs.readFile(rankingPath, "utf8");
    ranking = JSON.parse(rankingRaw);
  } catch {
    ranking = null;
  }

  const cards = buildCardCatalog(gameContent, ranking);
  return { cards, packConfigs: gameContent.packConfigs };
}
