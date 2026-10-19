import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkLimit = vi.fn();
const headersMock = vi.fn();

vi.mock("@/server/services/rate-limit-service", () => ({
  rateLimitService: { checkLimit: (...args: unknown[]) => checkLimit(...args) },
}));

vi.mock("next/headers", () => ({
  headers: (...args: unknown[]) => headersMock(...args),
}));

import {
  guardResendSignIn,
  isSignInEmailAllowed,
  parseSignInAllowlist,
} from "@/server/auth-js/magic-link-guard";

describe("parseSignInAllowlist", () => {
  it("returns an empty list for unset or blank values", () => {
    expect(parseSignInAllowlist(undefined)).toEqual([]);
    expect(parseSignInAllowlist("")).toEqual([]);
    expect(parseSignInAllowlist("  ,  , ")).toEqual([]);
  });

  it("splits on commas, trims, and lowercases entries", () => {
    expect(parseSignInAllowlist(" Alice@Example.com , @Corp.io ,beta.dev ")).toEqual([
      "alice@example.com",
      "@corp.io",
      "beta.dev",
    ]);
  });
});

describe("isSignInEmailAllowed", () => {
  it("allows everyone when no allowlist is configured", () => {
    expect(isSignInEmailAllowed("anyone@anywhere.com", undefined)).toBe(true);
    expect(isSignInEmailAllowed("anyone@anywhere.com", "")).toBe(true);
  });

  it("matches exact addresses case-insensitively", () => {
    const list = "alice@example.com";
    expect(isSignInEmailAllowed("alice@example.com", list)).toBe(true);
    expect(isSignInEmailAllowed("ALICE@Example.COM", list)).toBe(true);
    expect(isSignInEmailAllowed("bob@example.com", list)).toBe(false);
  });

  it("matches domains with or without a leading @", () => {
    expect(isSignInEmailAllowed("carol@corp.io", "@corp.io")).toBe(true);
    expect(isSignInEmailAllowed("carol@corp.io", "corp.io")).toBe(true);
    expect(isSignInEmailAllowed("carol@corp.io.evil.com", "@corp.io")).toBe(false);
    expect(isSignInEmailAllowed("carol@subcorp.io", "@corp.io")).toBe(false);
  });

  it("supports mixed address and domain entries", () => {
    const list = "alice@example.com, @corp.io";
    expect(isSignInEmailAllowed("alice@example.com", list)).toBe(true);
    expect(isSignInEmailAllowed("dave@corp.io", list)).toBe(true);
    expect(isSignInEmailAllowed("mallory@evil.com", list)).toBe(false);
  });
});

describe("guardResendSignIn", () => {
  beforeEach(() => {
    checkLimit.mockReset().mockResolvedValue(undefined);
    headersMock.mockReset().mockResolvedValue(new Headers({ "x-forwarded-for": "203.0.113.9" }));
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("refuses a missing email", async () => {
    await expect(guardResendSignIn({ email: null, isVerificationRequest: true })).resolves.toBe(
      false
    );
  });

  it("refuses an address outside the allowlist before any rate limiting", async () => {
    vi.stubEnv("AUTH_ALLOWED_EMAILS", "@corp.io");
    await expect(
      guardResendSignIn({ email: "mallory@evil.com", isVerificationRequest: true })
    ).resolves.toBe(false);
    expect(checkLimit).not.toHaveBeenCalled();
  });

  it("rate limits per address and per IP on verification requests", async () => {
    await expect(
      guardResendSignIn({ email: "Alice@Example.com", isVerificationRequest: true })
    ).resolves.toBe(true);
    expect(checkLimit).toHaveBeenCalledTimes(2);
    expect(checkLimit.mock.calls[0]?.[0]).toBe("alice@example.com");
    expect(checkLimit.mock.calls[1]?.[0]).toBe("203.0.113.9");
  });

  it("returns false when the rate limit throws", async () => {
    checkLimit.mockRejectedValueOnce(new Error("Too many requests"));
    await expect(
      guardResendSignIn({ email: "alice@example.com", isVerificationRequest: true })
    ).resolves.toBe(false);
  });

  it("skips rate limiting on the verification-click phase", async () => {
    await expect(
      guardResendSignIn({ email: "alice@example.com", isVerificationRequest: false })
    ).resolves.toBe(true);
    expect(checkLimit).not.toHaveBeenCalled();
  });

  it("still applies the per-address limit when no request scope is available", async () => {
    headersMock.mockRejectedValueOnce(new Error("headers() outside request scope"));
    await expect(
      guardResendSignIn({ email: "alice@example.com", isVerificationRequest: true })
    ).resolves.toBe(true);
    expect(checkLimit).toHaveBeenCalledTimes(1);
  });
});

describe("AUTH_RESEND_ENABLED build-time flag", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  const loadFlags = async () => {
    vi.resetModules();
    const mod = await import("@/config/features-config");
    return mod.buildTimeFeatures;
  };

  it("stays enabled in production when Resend is fully configured", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM_EMAIL", "login@example.com");
    vi.stubEnv("DISABLE_AUTH_RESEND", "");
    const flags = await loadFlags();
    expect(flags.AUTH_RESEND_ENABLED).toBe(true);
  });

  it("requires RESEND_FROM_EMAIL", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM_EMAIL", "");
    vi.stubEnv("DISABLE_AUTH_RESEND", "");
    const flags = await loadFlags();
    expect(flags.AUTH_RESEND_ENABLED).toBe(false);
  });

  it("respects DISABLE_AUTH_RESEND", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_123");
    vi.stubEnv("RESEND_FROM_EMAIL", "login@example.com");
    vi.stubEnv("DISABLE_AUTH_RESEND", "true");
    const flags = await loadFlags();
    expect(flags.AUTH_RESEND_ENABLED).toBe(false);
  });
});
