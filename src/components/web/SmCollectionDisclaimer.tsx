import { ChevronDown } from "lucide-react";
import { useState } from "react";

const CONTACT_EMAIL = "agrenoscar0@gmail.com";

/**
 * Collapsed-by-default note explaining how the couples in the SM collection were
 * picked, and how to get in touch if someone is missing.
 */
export function SmCollectionDisclaimer({ className = "" }: { className?: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <section className={`rounded-2xl border bg-white overflow-hidden ${className}`}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 px-6 py-4 text-left"
      >
        <h2 className="text-sm font-semibold text-gray-900">Vilka är med i kollektionen?</h2>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="px-6 pb-5 -mt-1">
          <p className="text-sm leading-relaxed text-gray-600">
            Vi har tagit alla som kvalificerade sig till SM 2026 som vi har hittat bilder på ifrån
            Angelicas Facebooksida. Det kan hända att vi missat någon och eftersom att det är många
            dansare är det inte konstigt om någon inte fastnat på bild. Uppmärksammar du att du eller
            någon annan saknas och har en bild i högkvalité som vi kan använda —{" "}
            <a
              href={`mailto:${CONTACT_EMAIL}?subject=Saknad%20dansare%20i%20SM-kollektionen`}
              className="font-medium text-purple-600 underline hover:text-purple-700"
            >
              maila oss
            </a>
            !
          </p>
        </div>
      )}
    </section>
  );
}
