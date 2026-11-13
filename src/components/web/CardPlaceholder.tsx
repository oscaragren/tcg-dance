import { useCallback, useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { ImageWithFallback } from "../shared/figma/ImageWithFallback";
import { resolveCardDesignUrl } from "../../data/cardDesignUrls";

interface CardPlaceholderProps {
  rarity?: "common" | "rare" | "epic" | "legendary" | "special";
  size?: "small" | "medium" | "large";
  name?: string;
  danceStyle?: string;
  /** e.g. "SM 2024" — shown before the dance style on multi-year collections. */
  event?: string;
  designKey?: string;
  /** When false, only the card frame is shown (no name/rarity below). */
  showCaption?: boolean;
  /** When true, clicking the card does not open the fullscreen lightbox. */
  disableLightbox?: boolean;
  /**
   * Hide the artwork and show a locked silhouette instead. Used by the "Se alla"
   * view on Samling: unowned cards reveal their name and dance style but the
   * design stays secret until the card is actually owned.
   */
  hideDesign?: boolean;
  /** Text under the "?" when the design is hidden. Defaults to "Saknas". */
  lockedLabel?: string;
}

export function CardPlaceholder({
  rarity = "common",
  size = "medium",
  name = "Your Card Design",
  danceStyle,
  event,
  designKey,
  showCaption = true,
  disableLightbox = false,
  hideDesign = false,
  lockedLabel = "Saknas",
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
    common: "from-rarity-common to-rarity-common/60",
    rare: "from-rarity-rare to-rarity-rare/60",
    epic: "from-rarity-epic to-rarity-epic/60",
    legendary: "from-rarity-legendary to-rarity-legendary/60",
    special: "from-rarity-special to-rarity-epic",
  };

  const sizes = {
    small: "w-32 h-40",
    medium: "w-48 h-60",
    large: "w-64 h-80",
  };

  const captionWidths = {
    small: "w-36",
    medium: "w-52",
    large: "w-68",
  };

  const rarityGlow = {
    common: "",
    rare: "shadow-rarity-rare/50",
    epic: "shadow-rarity-epic/50",
    legendary: "shadow-rarity-legendary/50",
    special: "shadow-rarity-special/50",
  };

  const rarityCaption = {
    common: "text-secondary",
    rare: "text-diamonds",
    epic: "text-text",
    legendary: "text-rarity-legendary",
    special: "text-rarity-epic",
  };

  const imageUrl = hideDesign ? undefined : resolveCardDesignUrl(designKey);
  const subtitle = [event, danceStyle].filter(Boolean).join(" · ");
  const isLocked = hideDesign;
  const lightboxDisabled = disableLightbox || isLocked;

  const caption = showCaption ? (
    <div className={`${captionWidths[size]} text-center mt-1.5 space-y-0.5`}>
      <div className={`text-[10px] uppercase tracking-wider font-semibold ${isLocked ? "text-tertiary" : rarityCaption[rarity]}`}>{rarity}</div>
      <div className="text-xs text-text leading-snug font-medium">{name}</div>
      {subtitle && (
        <div className="text-[10px] text-tertiary leading-tight">{subtitle}</div>
      )}
    </div>
  ) : null;

  const lockedInner = (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[10px] bg-raised">
      <span className="text-3xl text-text/25 select-none" aria-hidden>
        ?
      </span>
      <span className="px-2 text-center text-[9px] uppercase tracking-wider text-text/30">
        {lockedLabel}
      </span>
    </div>
  );

  const thumbnailInner = isLocked ? lockedInner : imageUrl ? (
    <div className="relative h-full w-full overflow-hidden rounded-[10px] bg-raised">
      <ImageWithFallback
        src={imageUrl}
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-top"
        aria-hidden
      />
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-lg bg-raised">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-text/10">
        <span className="text-3xl" aria-hidden>
          ⚡
        </span>
      </div>
    </div>
  );

  const lightboxInner = imageUrl ? (
    <div className="relative h-full w-full overflow-hidden rounded-[12px] bg-raised">
      <ImageWithFallback
        src={imageUrl}
        alt={name}
        className="absolute inset-0 h-full w-full object-cover object-top"
      />
    </div>
  ) : (
    <div className="flex h-full w-full items-center justify-center rounded-[12px] bg-raised">
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-text/10 md:h-36 md:w-36">
        <span className="text-6xl md:text-7xl" aria-hidden>
          ⚡
        </span>
      </div>
    </div>
  );

  const lightboxCaption = (
    <div className="mt-5 max-w-lg px-2 text-center">
      <div className="text-sm font-medium uppercase tracking-wider text-text/75">{rarity}</div>
      <div className="mt-1 text-lg font-semibold leading-snug text-text">{name}</div>
      {subtitle && (
        <div className="mt-1 text-sm text-text/60">{subtitle}</div>
      )}
    </div>
  );

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
            className="absolute -top-1 right-0 z-20 rounded-lg p-2 text-2xl leading-none text-text/90 transition hover:bg-text/10 hover:text-text sm:-right-2 sm:-top-2"
            aria-label="Stäng"
          >
            ×
          </button>
          <div className="sr-only" id={titleId}>
            {name}
          </div>
          <div
            className={`w-full max-w-[min(88vw,480px)] aspect-[4/5] shrink-0 rounded-xl bg-gradient-to-br ${rarityColors[rarity]} p-1 shadow-2xl ${rarityGlow[rarity]}`}
          >
            {lightboxInner}
          </div>
          {lightboxCaption}
        </div>
      </div>,
      document.body,
    );

  const cardFrame = (
    <div
      className={
        isLocked
          ? `${sizes[size]} rounded-xl bg-raised p-0.5 opacity-70`
          : `${sizes[size]} rounded-xl bg-gradient-to-br ${rarityColors[rarity]} p-0.5 shadow-lg ${rarityGlow[rarity]} transition-transform hover:scale-105 cursor-pointer`
      }
    >
      {thumbnailInner}
    </div>
  );

  return (
    <>
      <div className="inline-flex flex-col items-center">
        {lightboxDisabled ? (
          cardFrame
        ) : (
          <button
            type="button"
            onClick={openLightbox}
            className="rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
            aria-label={`Visa större: ${name}`}
          >
            {cardFrame}
          </button>
        )}
        {caption}
      </div>
      {!lightboxDisabled && lightbox}
    </>
  );
}
