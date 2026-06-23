import { Menu, User, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";

type HeaderProps = {
  username: string | null;
  onLogout: () => void;
};

export function Header({ username, onLogout }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  function closeMobile() { setMobileOpen(false); }

  return (
    <>
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4">
          <div className="flex items-center justify-between">

            {/* Logo */}
            <div className="flex items-center gap-8">
              <Link to="/" className="flex items-center" onClick={closeMobile}>
                <span className="text-xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                  Peppelinos Bar
                </span>
              </Link>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-6">
                <Link to="/samling" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Samling</Link>
                <Link to="/handel"  className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Handel</Link>
                <Link to="/byte"    className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Byte</Link>
                <Link to="/uppgradering" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">Uppgradering</Link>
              </nav>
            </div>

            {/* Desktop auth */}
            <div className="hidden md:flex items-center gap-3">
              {username ? (
                <>
                  <div className="flex items-center text-sm text-gray-700">
                    <User className="w-4 h-4 mr-2" />
                    {username}
                  </div>
                  <Button
                    variant="outline"
                    className="border-gray-300 text-gray-700 hover:border-gray-400"
                    onClick={onLogout}
                  >
                    Logga ut
                  </Button>
                </>
              ) : (
                <>
                  <Button asChild variant="outline" className="border-gray-300 text-gray-700 hover:border-gray-400">
                    <Link to="/auth?tab=login">
                      <User className="w-4 h-4 mr-2" />
                      Logga in
                    </Link>
                  </Button>
                  <Button asChild className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
                    <Link to="/auth?tab=register">Registrera dig</Link>
                  </Button>
                </>
              )}
            </div>

            {/* Mobile hamburger */}
            <button
              className="md:hidden p-2 rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
              onClick={() => setMobileOpen((o) => !o)}
              aria-label={mobileOpen ? "Stäng meny" : "Öppna meny"}
            >
              {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

          </div>
        </div>
      </header>

      {/* Mobile menu */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 md:hidden"
            onClick={closeMobile}
          />

          {/* Panel */}
          <div className="fixed top-[73px] left-0 right-0 z-40 bg-white border-b shadow-lg md:hidden">
            <nav className="container mx-auto px-6 py-4 flex flex-col gap-1">
              {[
                { to: "/samling", label: "Samling" },
                { to: "/handel",  label: "Handel" },
                { to: "/byte",    label: "Byte" },
                { to: "/uppgradering", label: "Uppgradering" },
              ].map(({ to, label }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={closeMobile}
                  className="rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  {label}
                </Link>
              ))}

              <div className="border-t border-gray-100 mt-2 pt-3 flex flex-col gap-2">
                {username ? (
                  <>
                    <div className="px-4 py-2 text-sm text-gray-500 flex items-center gap-2">
                      <User className="w-4 h-4" /> {username}
                    </div>
                    <button
                      onClick={() => { onLogout(); closeMobile(); }}
                      className="rounded-lg px-4 py-3 text-sm font-medium text-left text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Logga ut
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/auth?tab=login"
                      onClick={closeMobile}
                      className="rounded-lg px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                    >
                      Logga in
                    </Link>
                    <Link
                      to="/auth?tab=register"
                      onClick={closeMobile}
                      className="rounded-lg px-4 py-3 text-sm font-medium text-center bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:from-purple-700 hover:to-blue-700 transition-all"
                    >
                      Registrera dig
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        </>
      )}
    </>
  );
}
