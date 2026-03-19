import { CardPlaceholder } from "./CardPlaceholder";
import { Badge } from "../shared/ui/badge";

export function FeaturedCards() {
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="text-center mb-12">
          <Badge className="mb-4 bg-purple-100 text-purple-700 hover:bg-purple-200">
            Utvald samling
          </Badge>
          <h2 className="text-4xl md:text-5xl font-bold mb-4">
            Upptäck sällsynta kort
          </h2>
          <p className="text-gray-600 max-w-2xl mx-auto">
            Upptäck vår utvalda samling av sällsynta och legendariska kort.
          </p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 mb-8">
          <CardPlaceholder rarity="legendary" />
          <CardPlaceholder rarity="epic" />
          <CardPlaceholder rarity="rare" />
          <CardPlaceholder rarity="epic" />
          <CardPlaceholder rarity="legendary" />
        </div>

        <div className="text-center">
          <button className="text-purple-600 hover:text-purple-700 font-medium inline-flex items-center gap-2 group">
            Se alla kort i Galleriet
            <span className="group-hover:translate-x-1 transition-transform">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
