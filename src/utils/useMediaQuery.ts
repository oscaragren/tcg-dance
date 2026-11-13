import { useEffect, useState } from "react";

/** Tracks a CSS media query; updates when the viewport crosses it. False on the server. */
export function useMediaQuery(query: string): boolean {
  const get = () => typeof window !== "undefined" && window.matchMedia(query).matches;
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

/** Desktop layout breakpoint, matches Tailwind's `lg`. */
export const useIsDesktop = () => useMediaQuery("(min-width: 1024px)");
