import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(__dirname, "..");

function rarityFromRankingPosition(position) {
  const pos = Number(position);
  if (!Number.isFinite(pos) || pos < 1) return "common";
  if (pos <= 5) return "legendary";
  if (pos <= 15) return "epic";
  if (pos <= 40) return "rare";
  return "common";
}

function buildCardCatalog(gameContent, ranking, collectionId) {
  const bench = Array.isArray(gameContent.commonBenchCards) ? gameContent.commonBenchCards : [];
  const collection = (gameContent.collections ?? []).find((c) => c.id === collectionId);

  // Use pre-built card list if the collection defines one
  if (collection?.cards && collection.cards.length > 0) {
    const byId = new Map();
    for (const c of collection.cards) byId.set(c.id, { ...c, collectionId: collectionId ?? c.collectionId });
    for (const card of bench) {
      if (!byId.has(card.id)) byId.set(card.id, { ...card, collectionId });
    }
    return Array.from(byId.values());
  }

  // Fall back to building from ranking data
  const collectionDanceStyle = collection?.danceStyle;
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
      if (row.danceTeamId == null || !row.teamName) continue;
      const rarity = rarityFromRankingPosition(row.rankingPosition);
      const normalized = normalizeTeamLabel(row.teamName);
      const club = row.club ?? normalized.club ?? null;
      const danceStyle = row.danceStyle ?? collectionDanceStyle ?? null;
      fromRanking.push({
        id: `v4d-${String(row.danceTeamId)}`,
        name: normalized.teamName,
        rarity,
        collectionId,
        club: club || undefined,
        danceStyle: danceStyle || undefined,
        rankingPosition: row.rankingPosition,
      });
    }
  }

  const byId = new Map();
  for (const card of fromRanking) byId.set(card.id, card);
  for (const card of bench) {
    if (!byId.has(card.id)) byId.set(card.id, { ...card, collectionId });
  }

  return Array.from(byId.values());
}

export async function loadGameCatalog() {
  const gamePath = path.join(workspaceRoot, "data", "game-content.json");
  const rankingPath = path.join(workspaceRoot, "data", "vote4dance-ranking.json");

  const gameContent = JSON.parse(await fs.readFile(gamePath, "utf8"));

  let ranking = null;
  try {
    ranking = JSON.parse(await fs.readFile(rankingPath, "utf8"));
  } catch {
    ranking = null;
  }

  const collections = gameContent.collections ?? [];
  const primaryCollectionId = collections[0]?.id ?? "sm2026";
  const cards = buildCardCatalog(gameContent, ranking, primaryCollectionId);

  return {
    cards,
    collections,
    dailyDiamonds: gameContent.dailyDiamonds ?? 150,
    copiesPerRarity: gameContent.copiesPerRarity ?? { legendary: 3, epic: 7, rare: 15, common: 40 },
  };
}
