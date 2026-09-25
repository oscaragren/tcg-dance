import { useEffect, useState } from "react";

/**
 * Current time, re-rendering every `intervalMs`. Lets a page that was opened
 * before a scheduled pack release unlock its buy buttons without a reload.
 */
export function useNow(intervalMs = 15_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}
