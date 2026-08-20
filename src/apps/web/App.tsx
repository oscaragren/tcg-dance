import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Header } from "../../components/web/Header";
import { Hero } from "../../components/web/Hero";
import { FeaturedCollection } from "../../components/web/FeaturedCollection";
import { HowItWorks } from "../../components/web/HowItWorks";
import { Footer } from "../../components/web/Footer";
import { fetchCurrentUser, logoutUser } from "../../utils/authApi";
import { fetchIncomingTradeCount } from "../../utils/gameApi";
import type { AuthUser } from "../../types/auth";
import { AuthPage } from "./AuthPage";
import { CollectionPage } from "./CollectionPage";
import { LoggedInHomePage } from "./LoggedInHomePage";
import { HandelPage } from "./HandelPage";
import { TradePage } from "./TradePage";
import { NewTradePage } from "./NewTradePage";
import { MarkForTradePage } from "./MarkForTradePage";
import { ResetPasswordPage } from "./ResetPasswordPage";
import { PrivacyPage } from "./PrivacyPage";
import { UpgradePage } from "./UpgradePage";
import { TopplistaPage } from "./TopplistaPage";
import { PlayerCollectionPage } from "./PlayerCollectionPage";
import { TradeMarketPage } from "./TradeMarketPage";
import { AdminPage } from "./AdminPage";
import { collections } from "../../data/packs";

const featuredCollection = collections[collections.length - 1];

function LandingPage() {
  return (
    <main>
      <Hero />
{featuredCollection && <FeaturedCollection collection={featuredCollection} />}
      <HowItWorks />
    </main>
  );
}

function HomePage({ currentUser }: { currentUser: AuthUser | null }) {
  if (currentUser) {
    return <LoggedInHomePage username={currentUser.username} userEmail={currentUser.email} />;
  }
  return <LandingPage />;
}

/** Poll interval for the pending-trade badge. */
const TRADE_BADGE_POLL_MS = 60_000;

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [pendingTradeCount, setPendingTradeCount] = useState(0);
  const location = useLocation();

  // Keep the "Byte" badge fresh: refresh on every navigation (so it clears as
  // soon as an offer is handled) and on a slow timer while the tab is open.
  useEffect(() => {
    if (!currentUser) { setPendingTradeCount(0); return; }

    let cancelled = false;
    function refresh() {
      fetchIncomingTradeCount()
        .then(({ count }) => { if (!cancelled) setPendingTradeCount(count); })
        .catch(() => {});
    }

    refresh();
    const timer = setInterval(refresh, TRADE_BADGE_POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, [currentUser, location.pathname]);

  useEffect(() => {
    async function loadSession() {
      try {
        const user = await fetchCurrentUser();
        setCurrentUser(user);
      } catch {
        setCurrentUser(null);
      } finally {
        setIsAuthLoading(false);
      }
    }
    void loadSession();
  }, []);

  function handleLogin(user: AuthUser) {
    setCurrentUser(user);
  }

  async function handleLogout() {
    try {
      await logoutUser();
    } catch {
      // intentional
    }
    setCurrentUser(null);
    setPendingTradeCount(0);
  }

  if (isAuthLoading) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="min-h-screen bg-white">
      <Header
        username={currentUser?.username ?? null}
        onLogout={handleLogout}
        pendingTradeCount={pendingTradeCount}
      />
      <Routes>
        <Route path="/"         element={<HomePage currentUser={currentUser} />} />
        <Route path="/samling"      element={<CollectionPage userEmail={currentUser?.email ?? null} />} />
        <Route path="/samling/byte" element={<MarkForTradePage currentUser={currentUser} />} />
        <Route path="/handel"   element={<HandelPage currentUser={currentUser} />} />
        <Route path="/uppgradering" element={<UpgradePage currentUser={currentUser} />} />
        <Route path="/topplista" element={<TopplistaPage currentUser={currentUser} />} />
        <Route path="/byte"     element={<TradePage currentUser={currentUser} />} />
        <Route path="/byte/ny"  element={<NewTradePage currentUser={currentUser} />} />
        <Route path="/byte/marknad" element={<TradeMarketPage currentUser={currentUser} />} />
        <Route path="/spelare/:userId" element={<PlayerCollectionPage currentUser={currentUser} />} />
        <Route path="/auth"                  element={<AuthPage onLogin={handleLogin} />} />
        <Route path="/aterstall-losenord"   element={<ResetPasswordPage />} />
        <Route path="/integritetspolicy"    element={<PrivacyPage />} />
        <Route path="/admin"                 element={<AdminPage />} />
      </Routes>
      <Footer />
    </div>
  );
}
