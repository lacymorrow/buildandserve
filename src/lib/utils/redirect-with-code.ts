/**
 * Redirect utilities with status code support.
 * Re-exports from redirect.ts for backward compatibility.
 */
export { createRedirectUrl, redirect, routeRedirect } from "./redirect";

// Legacy aliases
export { redirect as redirectWithCode, routeRedirect as routeRedirectWithCode } from "./redirect";
