import { Link } from "react-router-dom";
import { unreleasedPackCollections } from "../../data/packs";

/**
 * Sits above the featured-collection section on the landing page. Shown for
 * collections whose cards are already live (Samling, byten, uppgradering)
 * but whose pack isn't on sale yet — renders nothing once every pack is.
 */
export function UpcomingCollectionTeaser() {
  if (unreleasedPackCollections.length === 0) return null;

  return (
    <section className="bg-gray-950 py-8 md:py-10">
      <div className="container mx-auto px-6 space-y-4">
        {unreleasedPackCollections.map((collection) => (
          <div
            key={collection.id}
            className="max-w-5xl mx-auto rounded-2xl border border-dashed border-purple-400/30 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10 px-6 py-6 md:px-8 md:py-7"
          >
            <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
              <div className="inline-flex shrink-0 items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs uppercase tracking-wider w-fit">
                ✨ Ny kollektion
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-xl md:text-2xl font-bold text-white mb-1">{collection.label}</h2>
                {collection.description && <p className="text-gray-400 text-sm">{collection.description}</p>}
                <p className="text-gray-500 text-xs mt-1">Packet släpps snart — korten finns redan i Samling.</p>
              </div>
              <Link
                to="/samling"
                className="shrink-0 text-sm font-medium text-purple-300 hover:text-purple-200 transition-colors"
              >
                Se korten i Samling →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
