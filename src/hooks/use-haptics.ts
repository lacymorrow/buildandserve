"use client";

import { useMemo } from "react";

export type HapticPattern =
  | "light" | "medium" | "heavy" | "success" | "warning"
  | "error" | "selection" | "soft" | "rigid" | "nudge" | "buzz";

const noop = () => {};

/** Fire a haptic vibration pattern. No-ops when web-haptics is not installed. */
export function haptic(_pattern: HapticPattern = "light"): void {}

/** Cancel any ongoing haptic vibration. */
export function hapticCancel(): void {}

/**
 * React hook that returns memoised haptic helpers.
 * Stub — web-haptics package not installed.
 */
export function useHaptics() {
  return useMemo(
    () => ({
      tap: noop,
      toggle: noop,
      selection: noop,
      success: noop,
      warning: noop,
      error: noop,
      heavy: noop,
      soft: noop,
      rigid: noop,
      nudge: noop,
      buzz: noop,
      cancel: noop,
      isSupported: false,
      trigger: noop,
      haptic,
    }),
    []
  );
}
