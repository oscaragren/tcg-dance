import { ArrowLeftRight, ChevronDown, Home, Layers, LogOut, ShieldCheck, Store, Trophy, User, type LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Button } from "../shared/ui/button";
import { AnnouncementsMenu } from "./AnnouncementsMenu";
import { DiamondIcon } from "./DiamondIcon";

type HeaderProps = {
  username: string | null;
  onLogout: () => void;
  /** Incoming Trades waiting on the player; drives the count on the Byte tab. */
  pendingTradeCount?: number;
  /** Diamond balance. null while still loading. */
  diamonds?: number | null;
  /** At least one Chest is ready to collect; drives the dot on the Butik tab. */
  hasReadyChest?: boolean;
};

type Tab = {
  to: string;
  label: string;
  icon: LucideIcon;
  end?: boolean;
};

const TABS: Tab[] = [
  { to: "/", label: "Hem", icon: Home, end: true },
  { to: "/butik", label: "Butik", icon: Store },
  { to: "/samling", label: "Samling", icon: Layers },
  { to: "/byte", label: "Byte", icon: ArrowLeftRight },
  { to: "/topplista", label: "Topplista", icon: Trophy },
];

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-sign whitespace-nowrap leading-none text-text text-2xl ${className}`}
      style={{ textShadow: "0 0 6px var(--color-accent), 0 0 18px color-mix(in srgb, var(--color-accent) 55%, transparent)" }}
    >
      Peppelinos Bar
    </span>
  );
}

/** Diamond balance, shown in the top bar. */
function DiamondBalance({ diamonds }: { diamonds: number | null }) {
  return (
    <span
      className="inline-flex min-h-11 items-center gap-1.5 px-2 font-bold tabular-nums text-diamonds"
      title="Dina diamanter"
      aria-label={diamonds === null ? "Dina diamanter laddas" : `${diamonds} diamanter`}
    >
      <DiamondIcon size={20} />
      {diamonds === null ? "–" : diamonds.toLocaleString("sv-SE")}
    </span>
  );
}

/** Coral count badge: incoming Trades on the Byte tab. */
function CountBadge({ count }: { count: number }) {
  return (
    <span
      className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-accent px-1 text-[11px] font-bold leading-none text-accent-on"
      aria-label={`${count} nya byteförfrågningar`}
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

/** Coral dot: a Chest is ready to collect on the Butik tab. */
function ReadyDot() {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-accent"
      aria-label="En kista är klar att öppna"
      role="img"
    />
  );
}

function tabIndicator(tab: Tab, pendingTradeCount: number, hasReadyChest: boolean) {
  if (tab.to === "/byte" && pendingTradeCount > 0) return <CountBadge count={pendingTradeCount} />;
  if (tab.to === "/butik" && hasReadyChest) return <ReadyDot />;
  return null;
}

/** Profile icon with a menu: privacy policy and logout. */
function ProfileMenu({ username, onLogout }: { username: string; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded-full text-secondary transition-colors hover:bg-raised hover:text-text"
        aria-label={`Profil: ${username}`}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <User className="h-5 w-5" aria-hidden />
        <ChevronDown className="hidden h-4 w-4 lg:block" aria-hidden />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border bg-surface shadow-lg">
          <p className="truncate border-b px-4 py-3 text-sm text-secondary">{username}</p>
          <Link
            to="/integritetspolicy"
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex min-h-11 items-center gap-2 px-4 text-base text-text hover:bg-raised"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden /> Integritetspolicy
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => { setOpen(false); onLogout(); }}
            className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-base text-text hover:bg-raised"
          >
            <LogOut className="h-4 w-4" aria-hidden /> Logga ut
          </button>
        </div>
      )}
    </div>
  );
}

/** Slim top bar. On ≥1024px the tabs sit in it; on phones they live in the BottomTabBar. */
export function Header({ username, onLogout, pendingTradeCount = 0, diamonds = null, hasReadyChest = false }: HeaderProps) {
  return (
    <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-sm">
      <div className="container mx-auto flex min-h-14 items-center justify-between gap-4 px-4 lg:px-6">
        <div className="flex items-center gap-8">
          <Link to="/" className="flex min-h-11 items-center" aria-label="Peppelinos Bar, till startsidan">
            <Wordmark />
          </Link>

          {username && (
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Huvudmeny">
              {TABS.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={tab.to}
                  end={tab.end}
                  className={({ isActive }) =>
                    `flex min-h-11 items-center gap-2 rounded-md px-3 text-base font-medium transition-colors ${
                      isActive ? "text-accent" : "text-secondary hover:text-text"
                    }`
                  }
                >
                  {tab.label}
                  {tabIndicator(tab, pendingTradeCount, hasReadyChest)}
                </NavLink>
              ))}
            </nav>
          )}
        </div>

        {username ? (
          <div className="flex items-center gap-1">
            <DiamondBalance diamonds={diamonds} />
            <AnnouncementsMenu />
            <ProfileMenu username={username} onLogout={onLogout} />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/auth?tab=login">Logga in</Link>
            </Button>
            <Button asChild className="hidden sm:inline-flex">
              <Link to="/auth?tab=register">Registrera dig</Link>
            </Button>
          </div>
        )}
      </div>
    </header>
  );
}

/** Bottom tab bar, phones only. The active tab is coral; Byte shows the incoming Trade count and Butik a dot when a Chest is ready. */
export function BottomTabBar({ pendingTradeCount = 0, hasReadyChest = false }: Pick<HeaderProps, "pendingTradeCount" | "hasReadyChest">) {
  return (
    <nav
      aria-label="Huvudmeny"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          return (
            <li key={tab.to}>
              <NavLink
                to={tab.to}
                end={tab.end}
                className={({ isActive }) =>
                  `relative flex min-h-16 min-w-11 flex-col items-center justify-center gap-0.5 text-xs font-medium transition-colors ${
                    isActive ? "text-accent" : "text-secondary"
                  }`
                }
              >
                <span className="relative">
                  <Icon className="h-6 w-6" aria-hidden />
                  {tab.to === "/byte" && pendingTradeCount > 0 && (
                    <span className="absolute -right-3 -top-2"><CountBadge count={pendingTradeCount} /></span>
                  )}
                  {tab.to === "/butik" && hasReadyChest && (
                    <span className="absolute -right-2 -top-1"><ReadyDot /></span>
                  )}
                </span>
                {tab.label}
              </NavLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
