"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(pointer: coarse)";

const subscribe = (onChange: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
};

const getSnapshot = () => window.matchMedia(QUERY).matches;

// Server and hydration render false, same as the old effect-based hook.
const getServerSnapshot = () => false;

/**
 * Detects if the primary input device is touch-based.
 */
export function useTouchPrimary(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
