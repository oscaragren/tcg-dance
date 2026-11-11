import { Bell } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Announcement } from "../../types/game";
import { fetchAnnouncements, markAnnouncementsSeen } from "../../utils/gameApi";

/** Dispatched on window (detail: Announcement id) to open the bell feed on one Announcement. */
export const OPEN_ANNOUNCEMENT_EVENT = "open-announcement";

/** Same cadence as the other header badges (Byte, Samling). */
const POLL_MS = 60_000;

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

/**
 * Bell icon that opens a dropdown of the latest news/announcements, with
 * a small red dot while the newest one hasn't been opened yet. Placed to the
 * left of the username in the header (desktop and mobile).
 */
export function AnnouncementsMenu() {
  const [open, setOpen] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [hasUnseen, setHasUnseen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
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

  // Hem's banner asks the bell to open with its Announcement highlighted.
  useEffect(() => {
    function onOpenRequest(event: Event) {
      const id = (event as CustomEvent<string>).detail;
      setHighlightId(id);
      setOpen(true);
      setHasUnseen((unseen) => {
        if (unseen) markAnnouncementsSeen().catch(() => {});
        return false;
      });
    }
    window.addEventListener(OPEN_ANNOUNCEMENT_EVENT, onOpenRequest);
    return () => window.removeEventListener(OPEN_ANNOUNCEMENT_EVENT, onOpenRequest);
  }, []);

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
        className="relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-secondary hover:bg-raised hover:text-text transition-colors"
        aria-label={hasUnseen ? "Nyheter och meddelanden (nytt)" : "Nyheter och meddelanden"}
        aria-expanded={open}
      >
        <Bell className="h-5 w-5" aria-hidden />
        {hasUnseen && (
          <span
            className="absolute top-2 right-2 w-2.5 h-2.5 rounded-full bg-accent ring-2 ring-background"
            aria-hidden
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] rounded-xl border bg-surface shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-raised">
            <h3 className="text-sm font-semibold text-text">Nyheter</h3>
          </div>
          {announcements.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-secondary">Inga meddelanden än.</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto divide-y">
              {announcements.map((a) => (
                <li key={a.id} className={`px-4 py-3 ${a.id === highlightId ? "bg-raised" : ""}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-text">{a.title}</p>
                    <p className="text-[11px] text-tertiary shrink-0">{formatDate(a.createdAt)}</p>
                  </div>
                  <p className="mt-0.5 text-sm leading-relaxed text-text">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
