import type { NextConfig } from "next";
import withPWA from "next-pwa";
import { buildTimeFeatures } from "../features-config";

/**
 * Applies PWA configuration to the Next.js config.
 * @param nextConfig The existing Next.js configuration object.
 * @returns The modified Next.js configuration object with PWA support.
 */
export function withPWAConfig(nextConfig: NextConfig): NextConfig {
  const pwaConfig = {
    dest: "public",
    register: true,
    skipWaiting: true,
    disable: process.env.NODE_ENV === "development" || !buildTimeFeatures.PWA_ENABLED,
  };

  // The 'withPWA' type might be complex, using 'any' for simplicity here.
  // Types for 'next-pwa' come from the ambient declaration in src/types/next-pwa.d.ts.
  // Edit that file if you hit a type error here. Do not install '@types/next-pwa':
  // it declares a runtime dep on next@^12 || ^13, so bun nests a second Next and adds
  // ~254 MB of SWC binaries, which OOMs the production build (LAC-4110).
  return (withPWA as any)(pwaConfig)(nextConfig) as NextConfig;
}
