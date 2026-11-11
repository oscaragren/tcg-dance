import { Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import { dailyDiamonds } from "../../data/packs";
import { DiamondIcon } from "./DiamondIcon";

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
  /** Server's amount for today's claim (an event may raise it). */
  dailyDiamondsToday?: number;
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
  dailyDiamondsToday,
}: HeroSectionProps) {
  const todaysAmount = dailyDiamondsToday ?? dailyDiamonds;
  const isBoosted = todaysAmount > dailyDiamonds;
  return (
    <section className="relative w-full border-b bg-surface">
      <div className="container mx-auto px-6 py-10 md:py-14">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">

          {/* Greeting + balance */}
          <div className="min-w-0">
            <h1 className="text-3xl md:text-4xl font-bold leading-tight mb-5">
              Välkommen till Peppelinos Bar, {username}!
            </h1>

            <div className="flex items-baseline gap-1.5 mb-0.5">
              <span className="text-5xl font-bold tabular-nums text-diamonds">
                {isLoading ? "–" : diamonds}
              </span>
              <span className="text-2xl text-diamonds font-bold"><DiamondIcon /></span>
            </div>
            <p className="text-xs text-tertiary">
              {isBoosted
                ? <>Idag får du {todaysAmount} <DiamondIcon /> istället för {dailyDiamonds} <DiamondIcon />!</>
                : <>Du får {dailyDiamonds} <DiamondIcon /> gratis varje dag.</>}
            </p>
            {!isLoading && (
              <p className="text-xs text-rarity-legendary mt-1">
                <Flame className="inline h-4 w-4" aria-hidden /> Streak {diamondStreak}/{diamondStreakTarget} — varje hämtning tar dig ett steg
                utan uppehåll för 500 <DiamondIcon /> bonus.
              </p>
            )}
          </div>

          {/* Daily claim + shortcuts */}
          <div className="w-full md:w-80 shrink-0">
            <Button
              size="lg"
              onClick={onClaim}
              disabled={!canClaim || isLoading || isClaiming}
              className="bg-accent hover:bg-accent/90 text-accent-on w-full mb-1.5"
            >
              {isClaiming ? "Hämtar..." : canClaim ? <>Hämta {todaysAmount} <DiamondIcon /></> : "Diamanter hämtade idag"}
            </Button>
            {!isLoading && (
              <p className="text-[11px] text-tertiary mb-6">
                {canClaim ? "Dina dagliga diamanter väntar." : "Kom tillbaka imorgon."}
              </p>
            )}

            {!!streakBonusAwarded && (
              <p className="mb-4 text-sm font-medium text-rarity-legendary">
                <Flame className="inline h-4 w-4" aria-hidden /> Streak klar! +{streakBonusAwarded} <DiamondIcon /> streak-bonus.
              </p>
            )}

            {error && <p className="mb-4 text-sm text-danger">{error}</p>}

            <div className="flex flex-wrap gap-2 pt-4 border-t border-hairline">
              <Button asChild variant="outline" size="sm">
                <Link to="/butik">Köp pack</Link>
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
