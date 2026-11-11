// PROTOTYPE — throwaway, never ship. Wayfinder ticket "How should the chosen
// screens use the extra width on desktop?" (#19 on map #7).
//
// Plan: three wide-screen variants each for the phone picks (Hem B, Butik A,
// Samling B, Byte A), on the same throwaway route /prototyp/skarmar. Desktop
// shows at ≥1024px, or force it with ?vy=desktop / ?vy=mobil. Each screen's
// desktop variant is its own param (?skarm=byte&dbyte=B) so mixes are shareable.
//
// The three letters are three answers to "how far may desktop differ from phone":
//   A · Bredare      — the phone layout, stretched: more grid columns, sheets as dialogs.
//   B · Sidopanel    — same parts, plus a persistent side panel (list + detail).
//   C · Instrument   — a multi-column dashboard; everything visible at once.

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, User } from "lucide-react";
import { BarenRoot, Diamonds, PICKS, Stilark, Wordmark } from "./Baren";
import { butikDesktop } from "./ButikDesktop";
import { byteDesktop } from "./ByteDesktop";
import { hemDesktop } from "./HemDesktop";
import { samlingDesktop } from "./SamlingDesktop";
import { otherPlayers } from "./data";
import { CardSheet, SheetMode, StoreProvider, TABS, Toast, VariantSwitcher, useStore, type Screen, type SheetModeT } from "./kit";

export type DesktopVariantMap = Record<string, { name: string; sheet: SheetModeT; C: () => JSX.Element }>;
const SCREENS: Partial<Record<Screen, DesktopVariantMap>> = { hem: hemDesktop, butik: butikDesktop, samling: samlingDesktop, byte: byteDesktop };

function TopNav({ current }: { current: Screen }) {
  const s = useStore();
  const chestReady = s.chests.some((c) => c.readyInMin === 0);
  return (
    <header className="sticky top-0 z-30 border-b" style={{ background: "var(--bg)" }}>
      <div className="mx-auto flex h-14 max-w-[1280px] items-center gap-8 px-6">
        <Wordmark size={26} />
        <nav className="flex h-full flex-1 items-stretch gap-1">
          {TABS.map(({ id, label, Icon }) => (
            <button key={id} onClick={() => s.go(id)} className={`relative flex items-center gap-2 border-b-2 px-3 text-sm ${id === current ? "border-purple-600 font-semibold text-purple-700" : "border-transparent text-gray-500"}`}>
              <Icon className="h-4 w-4" />{label}
              {id === "byte" && s.trades.length > 0 && <span className="grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{s.trades.length}</span>}
              {id === "butik" && chestReady && <span className="h-2 w-2 rounded-full bg-red-500" />}
            </button>
          ))}
        </nav>
        <div className="flex items-center gap-1">
          <Diamonds n={s.diamonds} className="mr-2" />
          <button className="relative grid h-10 w-10 place-items-center text-gray-600" aria-label="Notiser"><Bell className="h-5 w-5" /><span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-red-500" /></button>
          <button className="grid h-10 w-10 place-items-center text-gray-600" aria-label="Profil"><User className="h-5 w-5" /></button>
        </div>
      </div>
    </header>
  );
}

function Topplista() {
  return (
    <div className="mx-auto max-w-2xl p-6">
      <p className="mb-3 rounded-lg bg-gray-50 p-3 text-xs text-gray-500">Topplista är oförändrad i relaunchen. Inte en del av prototypen.</p>
      {otherPlayers.map((p) => <div key={p.id} className="flex h-11 items-center justify-between border-b text-sm"><span>{p.rank}. {p.name}</span><span className="text-amber-700">{p.legendaries}</span></div>)}
    </div>
  );
}

export function DesktopPrototype() {
  const [params, setParams] = useSearchParams();
  const screen = (params.get("skarm") as Screen) ?? "hem";
  const variants = SCREENS[screen];
  const keys = variants ? Object.keys(variants) : [];
  const key = `d${screen}`;
  const current = (params.get(key) ?? PICKS[key] ?? "A").toUpperCase();
  const go = useCallback((s: Screen) => {
    setParams((p) => { p.set("skarm", s); return p; }, { replace: true });
    window.scrollTo(0, 0);
  }, [setParams]);
  const setVariant = (k: string) => setParams((p) => { p.set(key, k); return p; }, { replace: true });
  const v = variants?.[current];
  const Body = screen === ("stil" as Screen) ? () => <Stilark owned={{}} wide /> : v?.C ?? Topplista;
  return (
    <StoreProvider go={go}>
      <BarenRoot switcherBottom="bottom-16">
      <SheetMode.Provider value={v?.sheet ?? "dialog"}>
        <div className="min-h-screen pb-28" style={{ background: "var(--bg)" }}>
          <TopNav current={screen} />
          <Body key={`${screen}-${current}`} />
          <CardSheet />
          <Toast />
          {variants && (
            <VariantSwitcher keys={keys} names={Object.fromEntries(keys.map((k) => [k, variants[k].name]))} current={current} onChange={setVariant} bottom="bottom-4"
              extra={<button onClick={() => setParams((p) => { p.set("vy", "mobil"); return p; }, { replace: true })} className="ml-1 rounded-full px-2 py-1 text-yellow-200/70 hover:bg-white/10">📱 mobil</button>} />
          )}
        </div>
      </SheetMode.Provider>
      </BarenRoot>
    </StoreProvider>
  );
}
