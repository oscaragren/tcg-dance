import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";

const CONTACT_EMAIL = "agrenoscar0@gmail.com";

type FaqEntry = {
  question: string;
  answer: React.ReactNode;
};

const FAQ_ITEMS: FaqEntry[] = [
  {
    question: "Vad är Peppelinos Bar?",
    answer: (
      <>
        Ett digitalt samlarkortspel med svenska tävlingsdansare. Öppna kortpaket, bygg din
        egen samling och byt kort med andra spelare.
      </>
    ),
  },
  {
    question: "Kostar det något att spela?",
    answer: (
      <>
        Nej, det är gratis. Du får 150 diamanter varje dag som du kan använda till kortpaket
        och kistor.
      </>
    ),
  },
  {
    question: "Hur får jag fler kort?",
    answer: (
      <>
        Köp kortpaket i Handel — varje paket innehåller 5 kort. Du kan även vinna kort genom
        att öppna kistor.
      </>
    ),
  },
  {
    question: "Hur fungerar byten?",
    answer: (
      <>
        Bläddra i en annan spelares samling under Byte och skicka ett byteserbjudande med
        korten du vill ha och de du erbjuder i utbyte. Motparten väljer själv om de vill
        acceptera, motbjuda eller tacka nej — inget byte sker förrän båda är överens.
      </>
    ),
  },
  {
    question: "Vad är kistor?",
    answer: (
      <>
        Brons-, silver- och guldkistor köps för diamanter och tar en stund innan de går att
        öppna. När en kista är redo får du diamanter och kort ur den. Du har alltid en gratis
        plats som tar valfri kista, och kan köpa en egen plats per kisttyp om du vill kunna
        ha fler kistor samtidigt.
      </>
    ),
  },
  {
    question: "Hur stor är chansen att få kort ur en kista?",
    answer: (
      <>
        Varje kista rullar sina chanser för sig, oberoende av varandra, när du öppnar den:
        <br />
        <br />
        Bronskista — 25% chans på ett common-kort, 0,1% chans på ett rare-kort.
        <br />
        Silverkista — två separata slag på 25% vardera för ett common-kort, plus 2,5% chans
        på ett rare-kort.
        <br />
        Guldkista — tre separata slag på 25% vardera för ett common-kort, plus 2,5% chans på
        ett rare-kort och 0,01% chans på ett epic-kort.
        <br />
        <br />
        Du kan alltså få flera kort ur samma kista, eller inga alls — chanserna gäller
        oavsett hur många diamanter kistan också ger.
      </>
    ),
  },
  {
    question: "Kan jag göra något med dubbletter?",
    answer: (
      <>
        Ja, du kan uppgradera kort av samma sällsynthet till ett sällsyntare: 20 kort av
        rariteten common ger ett rare-kort, 15 rare ger ett epic och 10 epic ger ett
        legendary.
      </>
    ),
  },
  {
    question: "Hur tar jag bort mitt konto eller mina kort?",
    answer: (
      <>
        Mejla oss på{" "}
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Begäran%20om%20borttagning%20av%20kort/konto`}
          className="font-medium text-purple-600 underline hover:text-purple-700"
        >
          {CONTACT_EMAIL}
        </a>{" "}
        så hjälper vi dig. Läs mer om hur vi hanterar dina uppgifter i vår{" "}
        <Link to="/integritetspolicy" className="font-medium text-purple-600 underline hover:text-purple-700">
          integritetspolicy
        </Link>
        .
      </>
    ),
  },
];

function FaqItem({ entry }: { entry: FaqEntry }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="py-2">
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-3 py-3 text-left"
      >
        <span className="font-medium text-gray-900">{entry.question}</span>
        <ChevronDown
          className={`w-5 h-5 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>

      {isOpen && (
        <div className="pb-4 -mt-1">
          <p className="text-sm leading-relaxed text-gray-600">{entry.answer}</p>
        </div>
      )}
    </div>
  );
}

/** Landing-page FAQ — collapsed by default, one panel open at a time is not enforced. */
export function Faq() {
  return (
    <section className="py-20 bg-gray-50">
      <div className="container mx-auto px-6">
        <div className="max-w-2xl mx-auto">
          <div className="text-center mb-10">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Vanliga frågor</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Kort och gott om hur Peppelinos Bar fungerar.
            </p>
          </div>

          <div className="rounded-2xl border bg-white divide-y divide-gray-100 px-6">
            {FAQ_ITEMS.map((entry) => (
              <FaqItem key={entry.question} entry={entry} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
