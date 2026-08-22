import manifest from "./cardDesignManifest.json";

const extRe = /\.(png|jpe?g|webp)$/i;

/**
 * Base URL for the object-storage bucket / CDN that serves card artwork,
 * e.g. "https://pub-xxxxxxxx.r2.dev/card-art" or a custom domain pointed at
 * the same bucket. Baked into the client build via VITE_CARD_ART_BASE_URL —
 * see README > Card artwork storage.
 *
 * Card images are no longer bundled into the app: they're generated and
 * uploaded by scripts/publish-card-art.mjs, which also writes
 * cardDesignManifest.json (stem -> path relative to this base URL).
 */
const CARD_ART_BASE_URL = (import.meta.env.VITE_CARD_ART_BASE_URL ?? "").replace(/\/$/, "");

const urlByDesignKey: Record<string, string> = {};

function registerDesignKey(stem: string, relativePath: string) {
  const url = `${CARD_ART_BASE_URL}/${relativePath}`;
  urlByDesignKey[stem] = url;
  urlByDesignKey[stem.normalize("NFC")] = url;
  urlByDesignKey[stem.normalize("NFD")] = url;
}

for (const [key, relativePath] of Object.entries(manifest as Record<string, string>)) {
  const stem = key.replace(extRe, "");
  if (stem) {
    registerDesignKey(stem, relativePath);
  }
}

/** Resolve the CDN URL for a design file stem, e.g. "ID-001" */
export function resolveCardDesignUrl(designKey: string | undefined): string | undefined {
  if (!designKey) {
    return undefined;
  }
  return (
    urlByDesignKey[designKey] ??
    urlByDesignKey[designKey.normalize("NFC")] ??
    urlByDesignKey[designKey.normalize("NFD")]
  );
}
