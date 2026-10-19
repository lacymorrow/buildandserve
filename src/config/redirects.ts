import type { Route } from "next";
import { routes } from "./routes";

/**
 * Redirect type used by Next.js config.
 * Defined here (not in @/lib/utils/redirect) because next.config.ts imports
 * this file and cannot pull in next/navigation at transpile time.
 */
export interface Redirect {
  source: Route;
  destination: Route | `https://${string}`;
  permanent: boolean;
}

const createRedirects = (sources: Route[], destination: Route, permanent = false): Redirect[] => {
  if (!sources.length) return [];

  // Automatically generate both trailing-slash variants for each source.
  // This is necessary when skipTrailingSlashRedirect is enabled (e.g. for PostHog).
  const expanded = new Set<Route>();
  for (const source of sources) {
    expanded.add(source);
    if (source.endsWith("/") && source.length > 1) {
      expanded.add(source.slice(0, -1));
    } else if (!source.endsWith("/")) {
      expanded.add(`${source}/` as Route);
    }
  }

  return Array.from(expanded)
    .filter((source) => source !== destination)
    .map((source) => ({ source, destination, permanent }));
};

/**
 * Next.js redirect configuration.
 * Imported by next.config.ts — keep route aliases centralized here.
 */
/* eslint-disable-next-line @typescript-eslint/require-await */
export const redirects = async (): Promise<Redirect[]> => {
  return [
    // Legacy AI-fleet URLs point to lacymorrow.com; the pages live on at
    // /services/openclaw-setup and /services/paperclip-ai (LAC-3146)
    {
      source: "/services/openclaw" as Route,
      destination: "https://lacymorrow.com/services",
      permanent: true,
    },
    {
      source: "/services/paperclip" as Route,
      destination: "https://lacymorrow.com/services",
      permanent: true,
    },
    ...createRedirects(["/doc", "/docs", "/documentation"], routes.docs, true),
    ...createRedirects(
      ["/account", "/accounts", "/settings/accounts"],
      routes.settings.account,
      true
    ),
    ...createRedirects(["/join", "/signup", "/sign-up"], routes.auth.signUp, true),
    ...createRedirects(["/login", "/log-in", "/signin", "/sign-in"], routes.auth.signIn),
    ...createRedirects(["/logout", "/log-out", "/signout", "/sign-out"], routes.auth.signOut),
  ];
};
