import { useEffect, useState } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Header } from "../../components/web/Header";
import { Hero } from "../../components/web/Hero";
import { FeaturedCollection } from "../../components/web/FeaturedCollection";
import { HowItWorks } from "../../components/web/HowItWorks";
import { Footer } from "../../components/web/Footer";
import { GpEventNotice } from "../../components/web/GpEventNotice";
import { fetchCurrentUser, logoutUser } from "../../utils/authApi";
import { DIAMONDS_EVENT, fetchChests, fetchGameState, fetchIncomingTradeCount } from "../../utils/gameApi";
import type { AuthUser } from "../../types/auth";
import { AuthPage } from "./AuthPage";
import { CompleteProfilePage } from "./CompleteProfilePage";
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
  return (
    <>
      <GpEventNotice />
      {currentUser
        ? <LoggedInHomePage username={currentUser.username} userEmail={currentUser.email} />
        : <LandingPage />}
    </>
  );
}

/** Poll interval for the pending-trade badge. */
const TRADE_BADGE_POLL_MS = 60_000;

/** Poll interval for the ready-chest badge on "Samling". */
const CHEST_BADGE_POLL_MS = 60_000;

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [pendingTradeCount, setPendingTradeCount] = useState(0);
  const [diamonds, setDiamonds] = useState<number | null>(null);
  const [hasReadyChest, setHasReadyChest] = useState(false);
  const location = useLocation();

  // Header diamond balance. Seeded on login and on each navigation; kept live
  // in between by the DIAMONDS_EVENT any diamond-moving request emits.
  useEffect(() => {
    if (!currentUser) { setDiamonds(null); return; }

    let cancelled = false;
    fetchGameState()
      .then((state) => { if (!cancelled) setDiamonds(state.diamonds); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentUser, location.pathname]);

  useEffect(() => {
    function onDiamonds(event: Event) {
      setDiamonds((event as CustomEvent<number>).detail);
    }
    window.addEventListener(DIAMONDS_EVENT, onDiamonds);
    return () => window.removeEventListener(DIAMONDS_EVENT, onDiamonds);
  }, []);

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

  // Keep the "Samling" chest dot fresh: refresh on every navigation (so it
  // clears as soon as a ready chest is collected) and on a slow timer while
  // the tab is open, same pattern as the "Byte" badge above.
  useEffect(() => {
    if (!currentUser) { setHasReadyChest(false); return; }

    let cancelled = false;
    function refresh() {
      fetchChests()
        .then((data) => {
          if (cancelled) return;
          const ready = data.chests.some((c) => Date.parse(c.readyAt) <= Date.now());
          setHasReadyChest(ready);
        })
        .catch(() => {});
    }

    refresh();
    const timer = setInterval(refresh, CHEST_BADGE_POLL_MS);
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
    setDiamonds(null);
    setHasReadyChest(false);
  }

  if (isAuthLoading) {
    return <div className="min-h-screen bg-white" />;
  }

  // Hard gate for accounts that predate mandatory first/last names: nothing but
  // the completion form renders until they are filled in. The admin panel is
  // exempt because it has its own password login and must stay reachable even
  // if the operator's own player account is incomplete; the privacy policy is
  // exempt because it has to be readable before agreeing to hand over a name.
  const GATE_EXEMPT_PATHS = ["/admin", "/integritetspolicy"];
  const isGateExempt = GATE_EXEMPT_PATHS.some((p) => location.pathname.startsWith(p));

  if (currentUser && !currentUser.profileComplete && !isGateExempt) {
    return (
      <div className="min-h-screen bg-white">
        <CompleteProfilePage
          currentUser={currentUser}
          onComplete={setCurrentUser}
          onLogout={handleLogout}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <Header
        username={currentUser?.username ?? null}
        onLogout={handleLogout}
        pendingTradeCount={pendingTradeCount}
        diamonds={diamonds}
        hasReadyChest={hasReadyChest}
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
