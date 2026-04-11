import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { ImageWithFallback } from "../shared/figma/ImageWithFallback";
import { resolveCardDesignUrl } from "../../data/cardDesignUrls";

interface CardPlaceholderProps {
  rarity?: "common" | "rare" | "epic" | "legendary";
  size?: "small" | "medium" | "large";
  name?: string;
  designKey?: string;
  /** When false, only the card frame is shown (no name/rarity below). */
  showCaption?: boolean;
}

export function CardPlaceholder({
  rarity = "common",
  size = "medium",
  name = "Your Card Design",
  designKey,
  showCaption = true,
}: CardPlaceholderProps) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const titleId = useId();

  const openLightbox = useCallback(() => setLightboxOpen(true), []);
  const closeLightbox = useCallback(() => setLightboxOpen(false), []);

  useEffect(() => {
    if (!lightboxOpen) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLightbox();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [lightboxOpen, closeLightbox]);

  const rarityColors = {
    common: "from-gray-400 to-gray-600",
    rare: "from-blue-400 to-blue-600",
    epic: "from-purple-400 to-purple-600",
    legendary: "from-amber-400 to-amber-600",
  };

  const sizes = {
    small: "w-32 h-44",
    medium: "w-48 h-64",
    large: "w-64 h-80",
  };

  const captionWidths = {
    small: "w-32",
    medium: "w-48",
    large: "w-64",
  };

  const rarityGlow = {
    common: "",
    rare: "shadow-blue-500/50",
    epic: "shadow-purple-500/50",
    legendary: "shadow-amber-500/50",
  };

  const rarityCaption = {
    common: "text-gray-500",
    rare: "text-blue-600",
    epic: "text-purple-600",
    legendary: "text-amber-700",
  };

  const imageUrl = resolveCardDesignUrl(designKey);

  const caption = showCaption ? (
    <div className={`${captionWidths[size]} text-center mt-1.5 space-y-0.5`}>
      <div className={`text-[10px] uppercase tracking-wider ${rarityCaption[rarity]}`}>{rarity}</div>
      <div className="text-xs text-gray-800 line-clamp-2 leading-snug">{name}</div>
    </div>
  ) : null;

  const thumbnailInner = imageUrl ? (
    <div className="relative h-full w-full overflow-hidden rounded-[10px] bg-gray-900">
      <ImageWithFallback
        src={imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-top"
        aria-hidden
      />
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-gray-900">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-white/10 to-white/5">
        <span className="text-3xl" aria-hidden>
          ⚡
        </span>
      </div>
    </div>
  );

  const lightboxInner = imageUrl ? (
    <div className="relative h-full w-full overflow-hidden rounded-[12px] bg-gray-900">
      <ImageWithFallback
        src={imageUrl}
        alt={name}
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-gray-900">
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br from-white/10 to-white/5 md:h-36 md:w-36">
        <span className="text-6xl md:text-7xl" aria-hidden>
          ⚡
        </span>
      </div>
    </div>
  );

  const lightboxCaption =
    showCaption ? (
      <div className="mt-5 max-w-lg px-2 text-center">
        <div className="text-sm font-medium uppercase tracking-wider text-white/75">{rarity}</div>
        <div className="mt-1 text-lg font-medium leading-snug text-white">{name}</div>
      </div>
    ) : null;

  const lightbox =
    lightboxOpen &&
    createPortal(
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <button
          type="button"
          className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
          onClick={closeLightbox}
          aria-label="Stäng förstoring"
        />
        <div
          className="relative z-10 flex max-h-[min(92vh,900px)] w-full max-w-[min(92vw,520px)] flex-col items-center"
          onClick={(event) => event.stopPropagation()}
        >
          <button
            type="button"
            onClick={closeLightbox}
            className="absolute -top-1 right-0 z-20 rounded-lg p-2 text-2xl leading-none text-white/90 transition hover:bg-white/10 hover:text-white sm:-right-2 sm:-top-2"
            aria-label="Stäng"
          >
            ×
          </button>
          <div className="sr-only" id={titleId}>
            {name}
          </div>
          <div
            className={`w-full max-w-[min(88vw,480px)] aspect-[8/11] shrink-0 rounded-xl bg-gradient-to-br ${rarityColors[rarity]} p-1 shadow-2xl ${rarityGlow[rarity]}`}
          >
            {lightboxInner}
          </div>
          {lightboxCaption}
        </div>
      </div>,
      document.body,
    );

  return (
    <>
      <div className="inline-flex flex-col items-center">
        <button
          type="button"
          onClick={openLightbox}
          className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-2"
          aria-label={`Visa större: ${name}`}
        >
          <div
            className={`${sizes[size]} rounded-xl bg-gradient-to-br ${rarityColors[rarity]} p-0.5 shadow-lg ${rarityGlow[rarity]} transition-transform hover:scale-105 cursor-pointer`}
          >
            {thumbnailInner}
          </div>
        </button>
        {caption}
      </div>
      {lightbox}
    </>
  );
}
