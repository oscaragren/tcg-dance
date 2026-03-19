import { useEffect, useState } from "react";
import { Routes, Route } from "react-router-dom";
import { Header } from "../../components/web/Header";
import { Hero } from "../../components/web/Hero";
import { CollectionShowcase } from "../../components/web/CollectionShowcase";
import { Footer } from "../../components/web/Footer";
import { GalleryPage } from "./GalleryPage";
import { AuthPage } from "./AuthPage";
import { CollectionPage } from "./CollectionPage";
import { LoggedInHomePage } from "./LoggedInHomePage";

export type AuthUser = {
  username: string;
  email: string;
  password: string;
};

function HomePage({ currentUser }: { currentUser: AuthUser | null }) {
  if (currentUser) {
    return <LoggedInHomePage username={currentUser.username} userEmail={currentUser.email} />;
  }

  return (
    <main>
      <Hero />
      <CollectionShowcase />
    </main>
  );
}

export default function App() {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    const rawUser = localStorage.getItem("tcg-user");
    const sessionState = localStorage.getItem("tcg-session");
    if (!rawUser || sessionState !== "active") {
      return;
    }

    try {
      setCurrentUser(JSON.parse(rawUser) as AuthUser);
    } catch {
      localStorage.removeItem("tcg-user");
    }
  }, []);

  function handleLogin(user: AuthUser) {
    setCurrentUser(user);
  }

  function handleLogout() {
    setCurrentUser(null);
    localStorage.removeItem("tcg-session");
  }

  return (
    <div className="min-h-screen bg-white">
      <Header username={currentUser?.username ?? null} onLogout={handleLogout} />
      <Routes>
        <Route path="/" element={<HomePage currentUser={currentUser} />} />
        <Route path="/samling" element={<CollectionPage userEmail={currentUser?.email ?? null} />} />
        <Route path="/galleri" element={<GalleryPage />} />
        <Route path="/auth" element={<AuthPage onLogin={handleLogin} />} />
      </Routes>
      <Footer />
    </div>
  );
}
