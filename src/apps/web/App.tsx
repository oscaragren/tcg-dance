import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Header } from "../../components/web/Header";
import { Hero } from "../../components/web/Hero";
import { CardCarousel } from "../../components/web/CardCarousel";
import { FeaturedCollection } from "../../components/web/FeaturedCollection";
import { HowItWorks } from "../../components/web/HowItWorks";
import { Footer } from "../../components/web/Footer";
import { fetchCurrentUser, logoutUser } from "../../utils/authApi";
import type { AuthUser } from "../../types/auth";
import { GalleryPage } from "./GalleryPage";
import { AuthPage } from "./AuthPage";
import { CollectionPage } from "./CollectionPage";
import { LoggedInHomePage } from "./LoggedInHomePage";
import { HandelPage } from "./HandelPage";
import { TradePage } from "./TradePage";
import { NewTradePage } from "./NewTradePage";
import { collections } from "../../data/packs";

const featuredCollection = collections[collections.length - 1];

function LandingPage() {
  return (
    <main>
      <Hero />
      <CardCarousel />
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

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

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
  }

  if (isAuthLoading) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="min-h-screen bg-white">
      <Header username={currentUser?.username ?? null} onLogout={handleLogout} />
      <Routes>
        <Route path="/"         element={<HomePage currentUser={currentUser} />} />
        <Route path="/samling"  element={<CollectionPage userEmail={currentUser?.email ?? null} />} />
        <Route path="/galleri"  element={<GalleryPage />} />
        <Route path="/handel"   element={<HandelPage currentUser={currentUser} />} />
        <Route path="/byte"     element={<TradePage currentUser={currentUser} />} />
        <Route path="/byte/ny"  element={<NewTradePage currentUser={currentUser} />} />
        <Route path="/auth"     element={<AuthPage onLogin={handleLogin} />} />
      </Routes>
      <Footer />
    </div>
  );
}
