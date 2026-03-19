import { Menu, Search, User } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../shared/ui/button";

type HeaderProps = {
  username: string | null;
  onLogout: () => void;
};

export function Header({ username, onLogout }: HeaderProps) {
  return (
    <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="flex items-center gap-2">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white text-xl">⚡</span>
              </div>
              <span className="text-xl font-semibold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
                Danskort
              </span>
            </Link>
            <nav className="hidden md:flex items-center gap-6">
              <Link to="/samling" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Samling
              </Link>
              <Link to="/" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Marknad
              </Link>
              <Link to="/galleri" className="text-sm text-gray-600 hover:text-gray-900 transition-colors">
                Galleri
              </Link>
            </nav>
          </div>
          
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" className="hidden md:flex">
              <Search className="w-5 h-5" />
            </Button>
            {username ? (
              <>
                <div className="hidden md:flex items-center text-sm text-gray-700">
                  <User className="w-4 h-4 mr-2" />
                  {username}
                </div>
                <Button variant="outline" className="hidden md:flex" onClick={onLogout}>
                  Logga ut
                </Button>
              </>
            ) : (
              <>
                <Button asChild variant="outline" className="hidden md:flex">
                  <Link to="/auth?tab=login">
                    <User className="w-4 h-4 mr-2" />
                    Logga in
                  </Link>
                </Button>
                <Button asChild className="hidden md:flex bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700">
                  <Link to="/auth?tab=register">Registrera dig</Link>
                </Button>
              </>
            )}
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
