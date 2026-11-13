import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import { cards } from "../../data/cards";
import { featuredCollection, isPackPurchasable } from "../../data/packs";
import { useNow } from "../../utils/useNow";
import { DiamondIcon } from "./DiamondIcon";

// The start page talks about the newest collection only.
const featuredCards  = cards.filter((c) => c.collectionId === featuredCollection?.id);
const legendaryCount = featuredCards.filter((c) => c.rarity === "legendary").length;
const totalCount     = featuredCards.length;
const collectionName = featuredCollection?.label ?? "SM 2026";

export function Hero() {
  const now = useNow();
  const collectionStatus =
    featuredCollection && !isPackPurchasable(featuredCollection, now) ? "Ny kollektion" : "Nu tillgänglig";
  return (
    <section className="relative overflow-hidden bg-background py-20 md:py-32">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-raised text-text text-sm mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            {collectionName} · {collectionStatus}
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 text-text font-display">
            Samla dina favoritdansare.
          </h1>

          <p className="text-xl text-text mb-10 max-w-2xl mx-auto">
            Köp kortpaket, byt med andra spelare och bygg en unik samling av svenska tävlingsdansare.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-3 mb-16">
            <Button
              asChild
              size="lg"
              className="bg-accent text-accent-on hover:bg-accent/90 hover: text-lg px-8"
            >
              <Link to="/auth?tab=register">Börja samla gratis</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-hairline-strong text-text hover:border-hairline-strong">
              <Link to="/samling">Visa min samling</Link>
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-8 max-w-sm mx-auto">
            <div className="flex flex-col items-center gap-1">
              <div className="text-3xl font-bold text-text">{totalCount}</div>
              <div className="text-xs text-secondary uppercase tracking-wide">Unika kort</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-3xl font-bold text-rarity-legendary">{legendaryCount}</div>
              <div className="text-xs text-secondary uppercase tracking-wide">Legendary</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-3xl font-bold text-text">150</div>
              <div className="text-xs text-secondary uppercase tracking-wide">Gratis <DiamondIcon />/dag</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute top-20 left-10 w-72 h-72 bg-raised rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
      <div className="absolute bottom-20 right-10 w-72 h-72 bg-diamonds/15 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse delay-1000" />
    </section>
  );
}
