import { Link } from "react-router-dom";

export function Footer() {
  return (
    <footer className="border-t border-gray-200 py-6 text-center text-sm text-gray-500">
      <p>© {new Date().getFullYear()} Peppelinos Bar</p>
      <p className="mt-1">
        <Link to="/integritetspolicy" className="hover:text-purple-600 transition-colors">
          Integritetspolicy
        </Link>
      </p>
    </footer>
  );
}
