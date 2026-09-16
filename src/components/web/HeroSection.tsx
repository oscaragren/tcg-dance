import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import { dailyDiamonds } from "../../data/packs";

type HeroSectionProps = {
  username: string;
  diamonds: number;
  canClaim: boolean;
  isLoading: boolean;
  isClaiming: boolean;
  error: string | null;
  onClaim: () => void;
  /** Consecutive days claimed with no gap. */
  diamondStreak?: number;
  /** Streak length that pays out the bonus. */
  diamondStreakTarget?: number;
  /** Set right after a claim that completed the streak, for a one-off callout. */
  streakBonusAwarded?: number | null;
};

export function HeroSection({
  username,
  diamonds,
  canClaim,
  isLoading,
  isClaiming,
  error,
  onClaim,
  diamondStreak = 0,
  diamondStreakTarget = 7,
  streakBonusAwarded = null,
}: HeroSectionProps) {
  return (
    <section className="relative w-full border-b bg-white">
      <div className="container mx-auto px-6 py-10 md:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">

          {/* Greeting + balance */}
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-5">
              Välkommen till Peppelinos Bar, {username}!
            </h1>

            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span className="text-5xl font-bold tabular-nums text-blue-600">
                {isLoading ? "–" : diamonds}
              </span>
              <span className="text-2xl text-blue-400 font-bold">◆</span>
            </div>
            <p className="text-xs text-gray-400">
              Du får {dailyDiamonds} ◆ gratis varje dag.
            </p>
            {!isLoading && (
              <p className="text-xs text-amber-600 mt-1">
                🔥 {diamondStreak}/{diamondStreakTarget} dagar i rad — hämta {diamondStreakTarget} dagar
                utan uppehåll för 500 ◆ bonus.
              </p>
            )}
          </div>

          {/* Daily claim + shortcuts */}
          <div className="w-full md:w-80 shrink-0">
            <Button
              size="lg"
              onClick={onClaim}
              disabled={!canClaim || isLoading || isClaiming}
              className="bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white w-full mb-1.5"
            >
              {isClaiming ? "Hämtar..." : canClaim ? `Hämta ${dailyDiamonds} ◆` : "Diamanter hämtade idag"}
            </Button>
            {!isLoading && (
              <p className="text-[11px] text-gray-400 mb-6">
                {canClaim ? "Dina dagliga diamanter väntar." : "Kom tillbaka imorgon."}
              </p>
            )}

            {!!streakBonusAwarded && (
              <p className="mb-4 text-sm font-medium text-amber-600">
                🔥 {diamondStreakTarget} dagar i rad! +{streakBonusAwarded} ◆ streak-bonus.
              </p>
            )}

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-100">
              <Button asChild variant="outline" size="sm">
                <Link to="/handel">Köp pack</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/byte">Byt kort</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link to="/samling">Min samling</Link>
              </Button>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
