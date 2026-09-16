import { Megaphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Announcement } from "../../types/game";
import { fetchAnnouncements, markAnnouncementsSeen } from "../../utils/gameApi";

/** Same cadence as the other header badges (Byte, Samling). */
const POLL_MS = 60_000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

/**
 * Megaphone icon that opens a dropdown of the latest news/announcements, with
 * a small red dot while the newest one hasn't been opened yet. Placed to the
 * left of the username in the header (desktop and mobile).
 */
export function AnnouncementsMenu() {
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    function refresh() {
      fetchAnnouncements()
        .then(({ announcements: list, hasUnseen: unseen }) => {
          if (cancelled) return;
          setAnnouncements(list);
          setHasUnseen(unseen);
        })
        .catch(() => {});
    }

    refresh();
    const timer = setInterval(refresh, POLL_MS);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function handleToggle() {
    setOpen((wasOpen) => {
      const next = !wasOpen;
      if (next && hasUnseen) {
        setHasUnseen(false);
        markAnnouncementsSeen().catch(() => {});
      }
      return next;
    });
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={handleToggle}
        className="relative p-2 -m-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label={hasUnseen ? "Nyheter och meddelanden (nytt)" : "Nyheter och meddelanden"}
        aria-expanded={open}
      >
        <Megaphone className="w-4 h-4" />
        {hasUnseen && (
          <span
            className="absolute top-1 right-1 w-2 h-2 rounded-full bg-red-500 ring-2 ring-white"
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 max-w-[90vw] rounded-xl border bg-white shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Nyheter</h3>
          </div>
          {announcements.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500">Inga meddelanden än.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y">
              {announcements.map((a) => (
                <li key={a.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-gray-900">{a.title}</p>
                    <p className="text-[11px] text-gray-400 shrink-0">{formatDate(a.createdAt)}</p>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-gray-700">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
