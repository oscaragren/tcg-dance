export function PrivacyPage() {
  return (
    <main className="py-16 bg-gray-50 min-h-[calc(100vh-72px)]">
      <div className="container mx-auto px-6">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl border p-8 md:p-12 prose prose-gray max-w-none">

          <h1 className="text-3xl font-bold mb-2">Integritetspolicy</h1>
          <p className="text-sm text-gray-400 mb-8">Senast uppdaterad: maj 2026</p>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">1. Personuppgiftsansvarig</h2>
            <p className="text-gray-600 leading-relaxed">
              Peppelinos Bar ansvarar för behandlingen av dina personuppgifter på denna webbplats.
              Kontakta oss via e-post om du har frågor om hur vi hanterar dina uppgifter.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">2. Vilka uppgifter samlar vi in?</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              Vi samlar in de uppgifter du lämnar när du skapar ett konto:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>Användarnamn</li>
              <li>E-postadress</li>
              <li>Lösenord (lagras krypterat, vi kan aldrig se ditt lösenord i klartext)</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              Vi lagrar även spelrelaterad data kopplad till ditt konto: dina kort, diamanter, byteshistorik samt datum för dagliga belöningar.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">3. Varför behandlar vi dina uppgifter?</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              Dina personuppgifter behandlas för att:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li>Tillhandahålla och driva spelet (avtal)</li>
              <li>Låta dig logga in och komma åt din samling (avtal)</li>
              <li>Hantera kortbyten med andra spelare (avtal)</li>
              <li>Skicka en återställningslänk om du glömt ditt lösenord (berättigat intresse)</li>
            </ul>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">4. Hur länge sparar vi uppgifterna?</h2>
            <p className="text-gray-600 leading-relaxed">
              Dina uppgifter sparas så länge ditt konto är aktivt. Om du vill radera ditt konto och alla tillhörande uppgifter, kontakta oss så hanterar vi det skyndsamt.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">5. Delas dina uppgifter med tredje part?</h2>
            <p className="text-gray-600 leading-relaxed">
              Nej. Vi säljer eller delar inte dina personuppgifter med tredje parter. Ditt användarnamn är synligt för andra spelare i samband med kortbyten, men din e-postadress visas aldrig.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">6. Dina rättigheter (GDPR)</h2>
            <p className="text-gray-600 leading-relaxed mb-3">
              Enligt dataskyddsförordningen (GDPR) har du rätt att:
            </p>
            <ul className="list-disc list-inside text-gray-600 space-y-1">
              <li><strong>Få tillgång</strong> till de uppgifter vi har om dig</li>
              <li><strong>Rätta</strong> felaktiga uppgifter</li>
              <li><strong>Radera</strong> dina uppgifter ("rätten att bli glömd")</li>
              <li><strong>Begränsa</strong> behandlingen av dina uppgifter</li>
              <li><strong>Invända</strong> mot behandling som grundas på berättigat intresse</li>
              <li><strong>Dataportabilitet</strong> — få ut dina uppgifter i ett maskinläsbart format</li>
            </ul>
            <p className="text-gray-600 leading-relaxed mt-3">
              Kontakta oss för att utöva någon av dessa rättigheter. Du har också rätt att lämna klagomål till <a href="https://www.imy.se" target="_blank" rel="noopener noreferrer" className="text-purple-600 hover:underline">Integritetsskyddsmyndigheten (IMY)</a>.
            </p>
          </section>

          <section className="mb-8">
            <h2 className="text-xl font-semibold mb-3">7. Kakor (cookies)</h2>
            <p className="text-gray-600 leading-relaxed">
              Vi använder en inloggningscookie (<code className="text-sm bg-gray-100 px-1 py-0.5 rounded">tcg_auth_token</code>) för att hålla dig inloggad. Cookien är nödvändig för att tjänsten ska fungera och kräver inget samtycke. Vi använder inga spårnings- eller marknadsföringscookies.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold mb-3">8. Kontakt</h2>
            <p className="text-gray-600 leading-relaxed">
              Har du frågor om vår integritetspolicy eller hur vi behandlar dina uppgifter? Hör av dig till oss via webbplatsens kontaktinformation.
            </p>
          </section>

        </div>
      </div>
    </main>
  );
}
