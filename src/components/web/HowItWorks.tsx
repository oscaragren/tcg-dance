import { Link } from "react-router-dom";

const STEPS = [
  {
    number: "01",
    title: "Hämta dagliga diamanter",
    body: "Logga in varje dag och hämta dina gratis diamanter. De samlas på i din plånbok.",
    accent: "from-blue-500 to-cyan-500",
  },
  {
    number: "02",
    title: "Köp kortpaket i Handel",
    body: "Använd dina diamanter för att köpa pack. Varje pack innehåller 5 kort — kanske ett Legendary?",
    link: { to: "/handel", label: "Gå till Handel" },
    accent: "from-purple-500 to-blue-500",
  },
  {
    number: "03",
    title: "Byt kort med andra spelare",
    body: "Har du dubbletter? Skicka ett byteserbjudande och komplettera din samling via Byte.",
    link: { to: "/byte", label: "Gå till Byte" },
    accent: "from-amber-500 to-orange-500",
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 bg-white">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">Hur fungerar det?</h2>
            <p className="text-gray-500 max-w-xl mx-auto">
              Tre enkla steg — från nybörjare till samlare.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((step) => (
              <div key={step.number} className="flex flex-col gap-4">
                <div
                  className={`w-12 h-12 rounded-xl bg-gradient-to-br ${step.accent} flex items-center justify-center`}
                >
                  <span className="text-white font-bold text-sm">{step.number}</span>
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{step.body}</p>
                </div>
                {step.link && (
                  <Link
                    to={step.link.to}
                    className="text-sm font-medium text-purple-600 hover:text-purple-800 transition-colors mt-auto"
                  >
                    {step.link.label} →
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
