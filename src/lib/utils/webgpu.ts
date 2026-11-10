import * as React from "react";

declare global {
  interface Navigator {
    gpu?: {
      requestAdapter?: () => Promise<any>;
    };
  }
}

export function isWebGPUAvailable(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.navigator?.gpu?.requestAdapter;
}

const subscribeNever = () => () => undefined;

export function useWebGPUAvailability(): boolean {
  // Server and hydration render false; the client re-reads after hydration.
  return React.useSyncExternalStore(subscribeNever, isWebGPUAvailable, () => false);
}
