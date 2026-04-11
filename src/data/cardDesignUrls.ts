const extRe = /\.(png|jpe?g|webp)$/i;

const urlByDesignKey: Record<string, string> = {};

function registerDesignKey(stem: string, url: string) {
  urlByDesignKey[stem] = url;
  urlByDesignKey[stem.normalize("NFC")] = url;
  urlByDesignKey[stem.normalize("NFD")] = url;
}

const modules = import.meta.glob("../../data/designs/*.{png,jpg,jpeg,webp}", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

for (const filePath of Object.keys(modules)) {
  const fileName = filePath.split("/").pop() ?? filePath;
  const stem = fileName.replace(extRe, "");
  if (stem) {
    registerDesignKey(stem, modules[filePath]);
  }
}

/** Resolve bundled URL for a design file stem: firstname_lastname-firstname_lastname */
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
