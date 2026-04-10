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
    teamName: string;
    danceTeamId: string;
    rankingPosition: number;
  }>;
};

/** 1–5 legendary, 6–15 epic, 16–50 rare, 51+ common (invalid / missing → common). */
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
  if (pos <= 50) {
    return "rare";
  }
  return "common";
}

export function buildCardCatalog(
  gameContent: GameContentJson,
  ranking: Vote4DanceRankingJson | null | undefined,
): DanceCard[] {
  const bench = Array.isArray(gameContent.commonBenchCards) ? gameContent.commonBenchCards : [];
  const fromRanking: DanceCard[] = [];

  if (ranking?.couples && Array.isArray(ranking.couples)) {
    for (const row of ranking.couples) {
      if (row.danceTeamId == null || !row.teamName) {
        continue;
      }
      const rarity = rarityFromRankingPosition(row.rankingPosition);
      fromRanking.push({
        id: `v4d-${String(row.danceTeamId)}`,
        name: row.teamName,
        rarity,
      });
    }
  }

  const byId = new Map<string, DanceCard>();
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
