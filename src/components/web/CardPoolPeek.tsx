import { useEffect, useRef, useState } from "react";
import { Layers } from "lucide-react";
import { CardPoolRemaining } from "./CardPoolRemaining";

type CardPoolPeekProps = {
  collectionId: string;
  /** Collection name, shown as the panel heading. */
  label: string;
};

/**
 * Small button that reveals the remaining-cards breakdown on hover.
 *
 * Hover alone would leave the panel unreachable on touch devices and by
 * keyboard, so the button also toggles on click and opens on focus, with
 * Escape and outside-click closing it again.
 */
export function CardPoolPeek({ collectionId, label }: CardPoolPeekProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setIsOpen(false);
    }
    function handlePointerDown(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
    };
  }, [isOpen]);

  return (
    <div
      ref={wrapperRef}
      className="relative shrink-0"
      onMouseEnter={() => setIsOpen(true)}
      onMouseLeave={() => setIsOpen(false)}
    >
      <button
        type="button"
        aria-expanded={isOpen}
        aria-label="Visa hur många kort som är kvar i poolen"
        onClick={() => setIsOpen((open) => !open)}
        onFocus={() => setIsOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 shadow-sm transition-colors hover:border-purple-300 hover:text-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/40"
      >
        <Layers className="h-3.5 w-3.5" aria-hidden="true" />
        Kort kvar
      </button>

      {isOpen && (
        <div
          role="dialog"
          aria-label={"Kort kvar i poolen — " + label}
          className="absolute right-0 top-full z-40 mt-2 w-64 rounded-2xl border border-white/10 bg-gray-900 p-5 text-left shadow-xl"
        >
          <div className="mb-3 text-sm font-semibold text-white">{label}</div>
          <CardPoolRemaining collectionId={collectionId} />
        </div>
      )}
    </div>
  );
}
