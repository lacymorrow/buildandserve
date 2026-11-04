import { headers } from "next/headers";
import { rateLimits } from "@/config/rate-limits";
import { logger } from "@/lib/logger";
import { rateLimitService } from "@/server/services/rate-limit-service";

/**
 * Abuse controls for the Resend magic-link provider.
 *
 * Magic link is a real production sign-in method: anyone can type an address
 * into the form and make the app email it. Instead of disabling the provider
 * in production, we gate it here. Auth.js runs the `signIn` callback before
 * `sendVerificationRequest` (see @auth/core lib/actions/signin/send-token.js),
 * so refusing in the callback blocks the email send entirely.
 */

/**
 * Parse `AUTH_ALLOWED_EMAILS` into normalized entries.
 * Comma-separated; entries may be full addresses ("alice@example.com")
 * or domains ("corp.io" / "@corp.io").
 */
export function parseSignInAllowlist(raw: string | undefined | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry.length > 0);
}

/**
 * Check an address against the allowlist. An empty/unset allowlist allows everyone.
 */
// Read process.env at call time (not @/env, which snapshots at import) so tests
// and runtime config changes are picked up.
export function isSignInEmailAllowed(
  email: string,
  raw: string | undefined | null = process.env.AUTH_ALLOWED_EMAILS
): boolean {
  const entries = parseSignInAllowlist(raw);
  if (entries.length === 0) return true;

  const normalized = email.trim().toLowerCase();
  const domain = normalized.split("@")[1];

  return entries.some((entry) => {
    if (entry.startsWith("@")) return entry.slice(1) === domain;
    if (entry.includes("@")) return entry === normalized;
    return entry === domain;
  });
}

const getClientIp = async (): Promise<string | null> => {
  try {
    const requestHeaders = await headers();
    const forwarded = requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) return forwarded;
    return requestHeaders.get("x-real-ip") ?? null;
  } catch {
    // Outside a request scope; per-address limiting still applies.
    return null;
  }
};

interface GuardResendSignInInput {
  email: string | null | undefined;
  /** True on the send-token phase (POST /api/auth/signin/resend), false on the verification click. */
  isVerificationRequest: boolean;
}

/**
 * Returns false (→ AccessDenied, no email sent) when the address is missing,
 * not on the allowlist, or rate limited. Rate limits only apply on the send
 * phase; both limits no-op when Upstash Redis is not configured.
 */
export const guardResendSignIn = async ({
  email,
  isVerificationRequest,
}: GuardResendSignInInput): Promise<boolean> => {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();

  if (!isSignInEmailAllowed(normalized)) {
    logger.warn("Magic link sign-in refused: address not in AUTH_ALLOWED_EMAILS", {
      email: normalized,
    });
    return false;
  }

  if (!isVerificationRequest) return true;

  try {
    await rateLimitService.checkLimit(
      normalized,
      "auth-magic-link-email",
      rateLimits.magicLink.perEmail
    );
    const ip = await getClientIp();
    if (ip) {
      await rateLimitService.checkLimit(ip, "auth-magic-link-ip", rateLimits.magicLink.perIp);
    }
  } catch (error) {
    logger.warn("Magic link sign-in rate limited", {
      email: normalized,
      error: error instanceof Error ? error.message : "Unknown error",
    });
    return false;
  }

  return true;
};
