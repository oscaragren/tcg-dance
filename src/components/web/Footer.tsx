import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-hairline py-6 text-center text-sm text-secondary">
      <p>© {new Date().getFullYear()} Peppelinos Bar</p>
      <p className="mt-1">
        <Link to="/integritetspolicy" className="hover:text-text underline transition-colors">
          Integritetspolicy
        </Link>
      </p>
      <p className="mt-1">
        Vill du ta bort dina kort eller ditt konto?{" "}
        <a
          href="mailto:agrenoscar0@gmail.com?subject=Begäran%20om%20borttagning%20av%20kort/konto"
          className="hover:text-text underline transition-colors"
        >
          Mejla oss
        </a>
      </p>
    </footer>
  );
}
