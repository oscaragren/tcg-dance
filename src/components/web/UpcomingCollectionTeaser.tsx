import { Link } from "react-router-dom";
import { upcomingCollection } from "../../data/upcomingCollection";

/**
 * Sits above the current featured-collection section on the landing page.
 * Purely informational — no buy flow exists yet for this collection, so it
 * links out to Handel (which has its own "kommer snart" tile) rather than
 * offering any action here.
 */
export function UpcomingCollectionTeaser() {
  return (
    <section className="bg-gray-950 py-8 md:py-10">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto rounded-2xl border border-dashed border-purple-400/30 bg-gradient-to-br from-purple-500/10 via-transparent to-blue-500/10 px-6 py-6 md:px-8 md:py-7">
          <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-8">
            <div className="inline-flex shrink-0 items-center gap-2 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs uppercase tracking-wider w-fit">
              🔜 {upcomingCollection.tagline}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-xl md:text-2xl font-bold text-white mb-1">{upcomingCollection.label}</h2>
              <p className="text-gray-400 text-sm">{upcomingCollection.blurb}</p>
            </div>
            <Link
              to="/handel"
              className="shrink-0 text-sm font-medium text-purple-300 hover:text-purple-200 transition-colors"
            >
              Se i Handel →
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
