import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-500">
      <p>© {new Date().getFullYear()} Peppelinos Bar</p>
      <p className="mt-1">
        <Link to="/integritetspolicy" className="hover:text-purple-600 transition-colors">
          Integritetspolicy
        </Link>
        <span className="mx-2 text-gray-300">·</span>
        <Link to="/admin" className="hover:text-purple-600 transition-colors">
          Admin
        </Link>
      </p>
      <p className="mt-1">
        Vill du ta bort dina kort eller ditt konto?{" "}
        <a
          href="mailto:agrenoscar0@gmail.com?subject=Begäran%20om%20borttagning%20av%20kort/konto"
          className="hover:text-purple-600 transition-colors underline"
        >
          Mejla oss
        </a>
      </p>
    </footer>
  );
}
