import type { CardRarity, DanceCard } from "../types/danceCard";

export type PackConfig = {
  label: string;
  cardCount: number;
  price: number;
  rarityChances: Record<CardRarity, number>;
};

export type CollectionConfig = {
  id: string;
  label: string;
  /** Short form used in achievement titles, e.g. "SM26". Falls back to label. */
  shortLabel?: string;
  description?: string;
  danceStyle?: string;
  /** Pre-built card list — if present, used directly instead of ranking data. */
  cards?: DanceCard[];
  pack: PackConfig;
};

export type GameContentJson = {
  dailyDiamonds?: number;
  copiesPerRarity?: Record<string, number>;
  collections?: CollectionConfig[];
  commonBenchCards: DanceCard[];
};

export type Vote4DanceRankingJson = {
  couples?: Array<{
    tier?: string;
    teamName: string;
    club?: string | null;
    danceStyle?: string | null;
    danceTeamId: string;
    rankingPosition: number;
  }>;
};

function normalizeTeamLabel(raw: string): { teamName: string; club: string | null } {
  const withoutTier = String(raw ?? "").replace(/^\s*\[[^\]]+\]\s*/, "").trim();
  const m = /\s*\(([^)]+)\)\s*$/.exec(withoutTier);
  if (!m) return { teamName: withoutTier, club: null };
  const club = m[1].trim();
  const teamName = withoutTier.slice(0, m.index).trim();
  return { teamName, club: club || null };
}

export function rarityFromRankingPosition(position: number): CardRarity {
  const pos = Number(position);
  if (!Number.isFinite(pos) || pos < 1) return "common";
  if (pos <= 5) return "legendary";
  if (pos <= 15) return "epic";
  if (pos <= 40) return "rare";
  return "common";
}

export function buildCardCatalog(
  gameContent: GameContentJson,
  ranking: Vote4DanceRankingJson | null | undefined,
  collectionId?: string,
): DanceCard[] {
  const collection = gameContent.collections?.find((c) => c.id === collectionId);

  // Use pre-built card list if the collection defines one
  if (collection?.cards && collection.cards.length > 0) {
    return collection.cards.map((c) => ({ ...c, collectionId: collectionId ?? c.collectionId }));
  }

  // Fall back to building from ranking data
  const collectionDanceStyle = collection?.danceStyle;
  const fromRanking: DanceCard[] = [];

  if (ranking?.couples && Array.isArray(ranking.couples)) {
    for (const row of ranking.couples) {
      if (row.danceTeamId == null || !row.teamName) continue;
      const rarity = rarityFromRankingPosition(row.rankingPosition);
      const normalized = normalizeTeamLabel(row.teamName);
      const club = row.club ?? normalized.club ?? undefined;
      const danceStyle = row.danceStyle ?? collectionDanceStyle ?? undefined;
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

  return fromRanking;
}
