import { Megaphone } from "lucide-react";

/** Last calendar day (Europe/Stockholm) this notice should still show. */
const EVENT_NOTICE_LAST_DATE = "2026-09-26";

function isOnOrBeforeEventDay(): boolean {
  // sv-SE formats as "YYYY-MM-DD", which sorts correctly as a plain string.
  const stockholmToday = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  return stockholmToday <= EVENT_NOTICE_LAST_DATE;
}

/**
 * "Heads up" banner about the 800 ◆ daily-diamond bonus on GP competition day
 * (26 September). Shown on the landing page for both logged-in and logged-out
 * visitors; hides itself automatically once the event day has passed.
 */
export function GpEventNotice({ className = "" }: { className?: string }) {
  if (!isOnOrBeforeEventDay()) return null;

  return (
    <div className={`container mx-auto px-6 pt-6 ${className}`}>
      <div className="max-w-4xl mx-auto flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
        <Megaphone className="w-5 h-5 shrink-0 text-amber-600 mt-0.5" />
        <p className="text-sm leading-relaxed text-amber-900">
          På tävlingsdagen den 26:e september när Säävbuggen GP går av stapeln får alla
          kortsamlare 800 diamanter istället för 150 när man hämtar de dagliga diamanterna.
          Missa inte!
        </p>
      </div>
    </div>
  );
}
