import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WhatsNewSheet as WhatsNewSheetData } from "../../types/game";

type WhatsNewSheetProps = { sheet: WhatsNewSheetData; onClose: () => void };

type Card = { title: string; lines: string[] };

/** Cards of the sheet. Personal lines are added to the first card, only where their value is above 0. */
export function whatsNewCards(sheet: WhatsNewSheetData): Card[] {
  const personal: string[] = [];
  if (sheet.achievementPayout > 0) personal.push(`Du har fått ${sheet.achievementPayout} Diamanter för dina Achievements.`);
  if (sheet.cancelledTrades > 0) personal.push(`${sheet.cancelledTrades} av dina byten avbröts – skicka dem igen.`);
  return [
    {
      title: "Ny meny och Samlingsframsteg",
      lines: [
        "Menyn finns nu som flikar längst ner, med märken för det som väntar på dig.",
        "Varje Samling visar hur långt du har kommit, och du kan söka bland korten.",
        ...personal,
      ],
    },
    {
      title: "Streak och Veckomål",
      lines: [
        "Din Streak pausar nu om du missar en dag, i stället för att nollställas.",
        "Nya Veckomål varje vecka med Diamanter att hämta.",
      ],
    },
    {
      title: "Behåll",
      lines: [
        "Dina Dubbletter är nu tillgängliga för byte automatiskt.",
        "Vill du inte byta bort ett kort trycker du på Behåll, så syns det inte för andra.",
        "Ditt första exemplar av ett kort är aldrig tillgängligt.",
      ],
    },
  ];
}

/** "Det här är nytt": a one-time, swipeable tour of the relaunch for existing players. */
export function WhatsNewSheet({ sheet, onClose }: WhatsNewSheetProps) {
  const titleId = useId();
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const scroller = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const cards = whatsNewCards(sheet);
  const last = index === cards.length - 1;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, []);

  const goTo = (i: number) => {
    const el = scroller.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
    setIndex(i);
  };

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <button type="button" className="absolute inset-0 bg-black/70" onClick={onClose} aria-label="Stäng" />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl border bg-surface pb-6 pt-5 sm:rounded-2xl">
        <button type="button" onClick={onClose} aria-label="Stäng" className="absolute right-2 top-2 rounded-lg px-3 text-2xl leading-none text-secondary hover:text-text">×</button>
        <h2 id={titleId} className="px-5 font-display text-2xl font-bold">Det här är nytt</h2>
        <div
          ref={scroller}
          className="mt-3 flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none]"
          onScroll={(e) => {
            const el = e.currentTarget;
            setIndex(Math.round(el.scrollLeft / Math.max(el.clientWidth, 1)));
          }}
        >
          {cards.map((card, i) => (
            <section key={card.title} aria-label={card.title} aria-hidden={i !== index} className="w-full shrink-0 snap-center px-5">
              <div className="min-h-[13rem] rounded-xl bg-raised p-4">
                <h3 className="font-semibold">{card.title}</h3>
                <ul className="mt-2 space-y-2 text-sm text-secondary">
                  {card.lines.map((line) => <li key={line}>{line}</li>)}
                </ul>
              </div>
            </section>
          ))}
        </div>
        <div className="mt-3 flex justify-center gap-1.5" aria-hidden="true">
          {cards.map((c, i) => (
            <span key={c.title} className={`h-1.5 w-1.5 rounded-full ${i === index ? "bg-accent" : "bg-hairline-strong"}`} />
          ))}
        </div>
        <div className="mt-4 px-5">
          <button
            type="button"
            onClick={() => (last ? onClose() : goTo(index + 1))}
            className="w-full rounded-lg bg-accent py-2 text-sm font-semibold text-accent-on"
          >
            {last ? "Okej" : "Nästa"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
