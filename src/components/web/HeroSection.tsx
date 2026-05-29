import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import { dailyDiamonds } from "../../data/packs";

const imageModules = import.meta.glob("../../../data/carousel/*.{jpg,jpeg,png,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const carouselImages = Object.keys(imageModules)
  .sort()
  .map((key) => imageModules[key]);

type HeroSectionProps = {
  username: string;
  diamonds: number;
  canClaim: boolean;
  isLoading: boolean;
  isClaiming: boolean;
  error: string | null;
  onClaim: () => void;
};

export function HeroSection({
  username,
  diamonds,
  canClaim,
  isLoading,
  isClaiming,
  error,
  onClaim,
}: HeroSectionProps) {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (carouselImages.length <= 1) return;
    const id = setInterval(() => {
      setActive((i) => (i + 1) % carouselImages.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative w-full overflow-hidden bg-gray-950">
      <div className="grid grid-cols-1 md:grid-cols-[1fr_360px] min-h-[320px] md:min-h-[540px]">

        {/* ── Carousel ── */}
        <div className="relative min-h-[260px] md:min-h-0">

          {/* Slides */}
          {carouselImages.map((url, i) => (
            <div
              key={url}
              className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
                i === active ? "opacity-100" : "opacity-0"
              }`}
            >
              <img
                src={url}
                alt=""
                aria-hidden
                className="h-full w-full object-cover object-center"
              />
            </div>
          ))}

          {/* Fade toward panel on desktop */}
          <div className="absolute inset-0 hidden md:block bg-gradient-to-r from-black/10 via-transparent to-gray-950/95 pointer-events-none" />
          {/* Bottom fade on mobile */}
          <div className="absolute inset-0 block md:hidden bg-gradient-to-b from-black/5 to-gray-950 pointer-events-none" />

          {/* Dot navigation */}
          {carouselImages.length > 1 && (
            <div className="absolute bottom-5 left-6 flex gap-2 z-10">
              {carouselImages.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  aria-label={`Bild ${i + 1}`}
                  className={`h-1 rounded-full transition-all duration-300 ${
                    i === active ? "w-5 bg-white" : "w-1.5 bg-white/35 hover:bg-white/60"
                  }`}
                />
              ))}
            </div>
          )}
        </div>

        {/* ── Welcome panel ── */}
        <div className="relative z-10 flex flex-col justify-center bg-white px-8 py-10 md:px-10 shadow-[-24px_0_48px_rgba(0,0,0,0.35)]">
          <p className="text-xs font-semibold uppercase tracking-widest text-purple-500 mb-1">
            Peppelinos Bar
          </p>
          <h1 className="text-2xl font-bold mb-4 leading-tight">
            Välkommen,<br />{username}!
          </h1>

          <div className="flex items-baseline gap-1.5 mb-0.5">
            <span className="text-4xl font-bold tabular-nums text-blue-600">
              {isLoading ? "–" : diamonds}
            </span>
            <span className="text-xl text-blue-400 font-bold">◆</span>
          </div>
          <p className="text-xs text-gray-400 mb-5">
            Du får {dailyDiamonds} ◆ gratis varje dag.
          </p>

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
    </section>
  );
}
