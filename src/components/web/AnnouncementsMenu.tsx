import { Megaphone } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { announcements } from "../../data/announcements";

function formatDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("sv-SE", { day: "numeric", month: "long" });
}

/**
 * Megaphone icon that opens a dropdown of the latest news/announcements.
 * Placed to the left of the username in the header (desktop and mobile).
 */
export function AnnouncementsMenu() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="p-2 -m-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors"
        aria-label="Nyheter och meddelanden"
        aria-expanded={open}
      >
        <Megaphone className="w-4 h-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 max-w-[90vw] rounded-xl border bg-white shadow-lg z-50 overflow-hidden">
          <div className="px-4 py-3 border-b bg-gray-50">
            <h3 className="text-sm font-semibold text-gray-900">Nyheter</h3>
          </div>
          <ul className="max-h-96 overflow-y-auto divide-y">
            {announcements.map((a) => (
              <li key={a.id} className="px-4 py-3">
                <p className="text-[11px] text-gray-400 mb-1">{formatDate(a.date)}</p>
                <p className="text-sm text-gray-700 leading-relaxed">{a.body}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
