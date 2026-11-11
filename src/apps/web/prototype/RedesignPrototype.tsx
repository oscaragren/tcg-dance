// PROTOTYPE — throwaway, never ship. Wayfinder ticket "What should the key
// screens look like on a phone?" (#18 on map #7).
//
// Plan: three layout variants each for Hem, Butik, Samling (incl. Card sheet +
// Upgrade) and Byte (Matchningar + Trade builder), at phone width, on the
// throwaway route /prototyp/skarmar. The bottom tab bar switches screens; the
// floating black pill (or ← →) switches the current screen's variant. Each
// screen's variant is its own URL param (?skarm=byte&hem=B&byte=C) so mixes are
// shareable. Real Card catalog, fake player, in-memory state, no API calls.

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { butikVariants } from "./ButikVariants";
import { byteVariants } from "./ByteVariants";
import { hemVariants } from "./HemVariants";
import { samlingVariants } from "./SamlingVariants";
import { otherPlayers } from "./data";
import { DesktopPrototype } from "./DesktopPrototype";
import { BarenRoot, PICKS, Stilark } from "./Baren";
import { CardSheet, PhoneFrame, StoreProvider, TabBar, Toast, TopBar, VariantSwitcher, useStore, type Screen } from "./kit";

function StilarkScreen({ wide }: { wide?: boolean }) {
  const s = useStore();
  return <Stilark owned={s.owned} wide={wide} />;
}

type VariantMap = Record<string, { name: string; C: () => JSX.Element }>;
const SCREENS: Partial<Record<Screen, VariantMap>> = { hem: hemVariants, butik: butikVariants, samling: samlingVariants, byte: byteVariants };

function Topplista() {
  return (
    <div className="p-4">
      <p className="mb-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Topplista är oförändrad i relaunchen (rankas på Legendary). Inte en del av prototypen.</p>
      {otherPlayers.map((p) => <div key={p.id} className="flex h-11 items-center justify-between border-b text-sm"><span>{p.rank}. {p.name}</span><span className="text-amber-700">{p.legendaries}</span></div>)}
    </div>
  );
}

function PhonePrototype() {
  const [params, setParams] = useSearchParams();
  const screen = (params.get("skarm") as Screen) ?? "hem";
  const variants = SCREENS[screen];
  const keys = variants ? Object.keys(variants) : [];
  const current = (params.get(screen) ?? PICKS[screen] ?? "A").toUpperCase();
  const go = useCallback((s: Screen) => {
    setParams((p) => { p.set("skarm", s); return p; }, { replace: true });
    window.scrollTo(0, 0);
  }, [setParams]);
  const setVariant = (k: string) => setParams((p) => { p.set(screen, k); return p; }, { replace: true });
  const Body = screen === ("stil" as Screen) ? StilarkScreen : variants?.[current]?.C ?? Topplista;
  return (
    <StoreProvider go={go}>
      <BarenRoot>
      <PhoneFrame>
        <TopBar />
        <Body key={`${screen}-${current}`} />
        <CardSheet />
        <Toast />
        <TabBar current={screen} />
        {variants && <VariantSwitcher keys={keys} names={Object.fromEntries(keys.map((k) => [k, variants[k].name]))} current={current} onChange={setVariant} />}
      </PhoneFrame>
      </BarenRoot>
    </StoreProvider>
  );
}

/** ?vy=desktop|mobil forces a view; otherwise ≥1024px gets the desktop prototype (ticket #19). */
export function RedesignPrototype() {
  const [params] = useSearchParams();
  const vy = params.get("vy") ?? (window.innerWidth >= 1024 ? "desktop" : "mobil");
  return vy === "desktop" ? <DesktopPrototype /> : <PhonePrototype />;
}
