import { Link } from "react-router-dom";

/**
 * Hem header pill for Incoming Trades. A Trade is a decision about another player, so Hem only
 * points at /byte, where the full terms are shown; it never accepts anything itself.
 */
export function IncomingTradePill({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <Link to="/byte" className="mr-2 rounded-full bg-[#8b7bff] px-2.5 py-0.5 text-xs font-semibold text-white">
      <span aria-hidden>⇄</span> {count} byte{count === 1 ? "" : "n"}
    </Link>
  );
}
