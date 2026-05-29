const INSTAGRAM_URL = "https://www.instagram.com/angelicasfotografier"; // TODO: update handle
const FACEBOOK_URL = "https://www.facebook.com/angelicasfotografier"; // TODO: update handle

export function PhotographerPromo() {
  return (
    <section className="bg-white py-16">
      <div className="container mx-auto px-6">
        <div className="max-w-5xl mx-auto">
          <div className="rounded-2xl border overflow-hidden">
            <div className="grid grid-cols-1 md:grid-cols-2">

              {/* Image side */}
              <div className="relative bg-gradient-to-br from-gray-800 to-gray-950 min-h-64 md:min-h-80 flex items-center justify-center">
                {/* Replace the div below with an <img> once a photo is available */}
                <div className="flex flex-col items-center gap-3 text-white/20 select-none">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-20 h-20">
                    <path d="M12 15.2A3.2 3.2 0 1 0 12 8.8a3.2 3.2 0 0 0 0 6.4Z" />
                    <path fillRule="evenodd" d="M9 2 7.17 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.17L15 2H9Zm3 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" clipRule="evenodd" />
                  </svg>
                  <span className="text-sm tracking-wide">Foto kommer snart</span>
                </div>
              </div>

              {/* Text side */}
              <div className="flex flex-col justify-center p-8 md:p-10 bg-white">
                <p className="text-xs font-semibold uppercase tracking-widest text-purple-500 mb-2">
                  Fotografen bakom korten
                </p>
                <h2 className="text-2xl md:text-3xl font-bold mb-3 leading-tight">
                  Angelicas Fotografier
                </h2>
                <p className="text-gray-500 text-sm leading-relaxed mb-6">
                  Det är Angelica som fotograferar dansarna på SM och hennes bilder pryder korten i
                  Peppelinos Bar. Följ henne på sociala medier för att se mer av dansens värld
                  genom hennes lins.
                </p>
                <div className="flex flex-wrap gap-3">
                  <a
                    href={INSTAGRAM_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-pink-500">
                      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069ZM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0Zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324ZM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881Z" />
                    </svg>
                    Instagram
                  </a>
                  <a
                    href={FACEBOOK_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-blue-600">
                      <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.413c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.886v2.265h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073Z" />
                    </svg>
                    Facebook
                  </a>
                </div>
              </div>

            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
