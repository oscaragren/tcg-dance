import { Ban } from "lucide-react";
import { useEffect, useState } from "react";

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${days > 0 ? `${days} d ` : ""}${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Shown on every page while the logged-in player is banned. The server is what
 * actually enforces the ban (read-only access); this just tells the player why
 * every action fails and when they're back. Calls onExpired once the countdown
 * reaches zero so the app can re-fetch the user and drop the banner.
 */
export function BanBanner({
  bannedUntil,
  reason,
  onExpired,
}: {
  bannedUntil: string;
  reason: string | null;
  onExpired: () => void;
}) {
  const endsAt = Date.parse(bannedUntil);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = endsAt - now;
  useEffect(() => {
    if (remaining <= 0) onExpired();
    // Only fire on the transition to zero, not on every tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining <= 0]);

  if (remaining <= 0) return null;

  const endLabel = new Date(endsAt).toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="border-b border-red-200 bg-red-50">
      <div className="container mx-auto px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4 text-sm text-red-800">
        <div className="flex items-center gap-2 font-semibold">
          <Ban className="w-4 h-4 shrink-0" />
          Ditt konto är avstängt
        </div>
        <div className="flex-1 text-red-700">
          Du kan titta på din samling och marknaden, men inte öppna paket, kistor eller göra byten.
          {reason && <span className="block text-red-600">Anledning: {reason}</span>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-xs text-red-600">Tillbaka om</div>
          <div className="font-mono font-semibold tabular-nums text-base">{formatRemaining(remaining)}</div>
          <div className="text-xs text-red-500">{endLabel}</div>
        </div>
      </div>
    </div>
  );
}
