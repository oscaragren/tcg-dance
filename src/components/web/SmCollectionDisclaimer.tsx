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
    <section className={`border-0 bg-transparent md:rounded-2xl md:border md:bg-white md:overflow-hidden ${className}`}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="w-full flex items-center gap-1.5 md:justify-between md:gap-3 px-0 py-1 md:px-4 md:py-2 text-left"
      >
        <h2 className="text-[11px] font-semibold text-gray-500">Vilka är med i kollektionen?</h2>
        <ChevronDown
          className={`w-3 h-3 md:w-3.5 md:h-3.5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="px-0 md:px-6 pb-3 md:pb-5 -mt-1">
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
          <p className="mt-2 text-sm leading-relaxed text-gray-600">
            SM 21-25 innehåller alla finaler från SM 2021 till SM 2025.
          </p>
        </div>
      )}
    </section>
  );
}
