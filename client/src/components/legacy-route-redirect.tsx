import { useEffect } from "react";
import { useLocation } from "wouter";

/** Перенаправление устаревших URL на актуальные страницы. */
export function LegacyRouteRedirect({ to }: { to: string }) {
  const [, setLocation] = useLocation();
  useEffect(() => {
    setLocation(to);
  }, [setLocation, to]);
  return null;
}
