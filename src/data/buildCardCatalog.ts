import type { CardRarity, DanceCard } from "../types/danceCard";

export type GameContentJson = {
  packConfigs: Record<
    string,
    {
      label: string;
      cardCount: number;
      rarityChances: Record<CardRarity, number>;
    }
  >;
  commonBenchCards: DanceCard[];
};

export type Vote4DanceRankingJson = {
  couples?: Array<{
    tier?: string;
    teamName: string;
    club?: string | null;
    danceTeamId: string;
    rankingPosition: number;
  }>;
};

function normalizeTeamLabel(raw: string): { teamName: string; club: string | null } {
  const withoutTier = String(raw ?? "").replace(/^\s*\[[^\]]+\]\s*/, "").trim();
  const m = /\s*\(([^)]+)\)\s*$/.exec(withoutTier);
  if (!m) {
    return { teamName: withoutTier, club: null };
  }
  const club = m[1].trim();
  const teamName = withoutTier.slice(0, m.index).trim();
  return { teamName, club: club || null };
}

export function rarityFromRankingPosition(position: number): CardRarity {
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

export function buildCardCatalog(
  _gameContent: GameContentJson,
  ranking: Vote4DanceRankingJson | null | undefined,
): DanceCard[] {
  const fromRanking: DanceCard[] = [];

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
        rankingPosition: row.rankingPosition,
      });
    }
  }

  return fromRanking;
}
