import { Link } from "react-router-dom";
import { Button } from "../../components/shared/ui/button";
import { TradeMarket } from "../../components/web/TradeMarket";
import type { AuthUser } from "../../types/auth";

type TradeMarketPageProps = { currentUser: AuthUser | null };

/**
 * Standalone page for the market. The market itself also renders as a section
 * on /byte — both use the same <TradeMarket /> so they can never drift.
 */
export function TradeMarketPage({ currentUser }: TradeMarketPageProps) {
  if (!currentUser) {
    return (
      <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
        <div className="container mx-auto px-6">
          <div className="max-w-3xl mx-auto text-center bg-white border rounded-xl p-10">
            <h1 className="text-3xl md:text-4xl font-bold mb-4">Bytesmarknad</h1>
            <p className="text-gray-600 mb-6">Logga in för att se vilka kort andra spelare vill byta bort.</p>
            <Button asChild><Link to="/auth?tab=login">Logga in</Link></Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-4xl mx-auto space-y-8">

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold mb-2">Bytesmarknad</h1>
              <p className="text-gray-600">Hitta ett kort du saknar, eller bläddra bland allas byteshyllor.</p>
            </div>
            <Button asChild variant="outline">
              <Link to="/byte">Tillbaka till Byte</Link>
            </Button>
          </div>

          <TradeMarket />
        </div>
      </div>
    </main>
  );
}
