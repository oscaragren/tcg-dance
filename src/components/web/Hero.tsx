import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";
import { cards } from "../../data/cards";
import { collections } from "../../data/packs";

const legendaryCount = cards.filter((c) => c.rarity === "legendary").length;
const totalCount     = cards.length;
const collectionName = collections[0]?.label ?? "SM 2026";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-gray-50 to-white py-20 md:py-32">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 text-purple-700 text-sm mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
            {collectionName} · Nu tillgänglig
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-gray-900 via-purple-800 to-blue-900 bg-clip-text text-transparent">
            Samla dina favoritdansare.
          </h1>

          <p className="text-xl text-gray-600 mb-10 max-w-2xl mx-auto">
            Köp kortpaket, byt med andra spelare och bygg en unik samling av svenska tävlingsdansare.
          </p>

          <div className="flex flex-col sm:flex-row justify-center gap-3 mb-16">
            <Button
              asChild
              size="lg"
              className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-lg px-8"
            >
              <Link to="/auth?tab=register">Börja samla gratis</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-gray-300 text-gray-700 hover:border-gray-400">
              <Link to="/samling">Visa min samling</Link>
            </Button>
          </div>

          <div className="grid grid-cols-3 gap-8 max-w-sm mx-auto">
            <div className="flex flex-col items-center gap-1">
              <div className="text-3xl font-bold text-gray-900">{totalCount}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Unika kort</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-3xl font-bold text-amber-600">{legendaryCount}</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Legendary</div>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="text-3xl font-bold text-gray-900">150</div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Gratis ◆/dag</div>
            </div>
          </div>
        </div>
      </div>

      <div className="absolute top-20 left-10 w-72 h-72 bg-purple-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
      <div className="absolute bottom-20 right-10 w-72 h-72 bg-blue-200 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse delay-1000" />
    </section>
  );
}
