// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Regression cover for LAC-4265. townofharmony.org shipped `/sign-in` and
 * `/sign-up` as a card with a heading, a subtitle, a link to the other dead
 * page, and zero controls: no input, no OAuth button, no submit.
 *
 * `NEXT_PUBLIC_FEATURE_AUTH_ENABLED` and
 * `NEXT_PUBLIC_FEATURE_AUTH_METHODS_ENABLED` were both true, because Better
 * Auth turns itself on from `APP_SECRET` plus a database and both flags count
 * it. Better Auth contributes nothing to the card, so the pages have to gate on
 * the controls that actually render.
 */

type Flags = Record<string, boolean | string | undefined>;

const load = async (flags: Flags) => {
  vi.resetModules();
  vi.doMock("@/env", () => ({ env: flags }));
  return await import("@/lib/auth/auth-ui-availability");
};

/** What townofharmony.org prod has set: Better Auth on, no provider. */
const BETTER_AUTH_ONLY: Flags = {
  NEXT_PUBLIC_FEATURE_AUTH_ENABLED: true,
  NEXT_PUBLIC_FEATURE_AUTH_METHODS_ENABLED: true,
  NEXT_PUBLIC_FEATURE_BETTER_AUTH_ENABLED: true,
};

describe("hasUsableAuthControls", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/env");
  });

  it("is false when Better Auth is the only thing enabled", async () => {
    const { hasUsableAuthControls } = await load(BETTER_AUTH_ONLY);
    expect(hasUsableAuthControls()).toBe(false);
  });

  it("is false when nothing is configured", async () => {
    const { hasUsableAuthControls } = await load({});
    expect(hasUsableAuthControls()).toBe(false);
  });

  it.each([
    ["credentials", "NEXT_PUBLIC_FEATURE_AUTH_CREDENTIALS_ENABLED"],
    ["magic link", "NEXT_PUBLIC_FEATURE_AUTH_RESEND_ENABLED"],
    ["guest", "NEXT_PUBLIC_FEATURE_AUTH_GUEST_ENABLED"],
    ["GitHub", "NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED"],
    ["Google", "NEXT_PUBLIC_FEATURE_AUTH_GOOGLE_ENABLED"],
    ["Twitter", "NEXT_PUBLIC_FEATURE_AUTH_TWITTER_ENABLED"],
    ["Discord", "NEXT_PUBLIC_FEATURE_AUTH_DISCORD_ENABLED"],
    ["GitLab", "NEXT_PUBLIC_FEATURE_AUTH_GITLAB_ENABLED"],
    ["Bitbucket", "NEXT_PUBLIC_FEATURE_AUTH_BITBUCKET_ENABLED"],
  ])("is true when %s is the only control", async (_label, flag) => {
    const { hasUsableAuthControls } = await load({ ...BETTER_AUTH_ONLY, [flag]: true });
    expect(hasUsableAuthControls()).toBe(true);
  });

  it("ignores Vercel account linking, which is not a sign-in method", async () => {
    const { hasUsableAuthControls } = await load({
      ...BETTER_AUTH_ONLY,
      NEXT_PUBLIC_FEATURE_AUTH_VERCEL_ENABLED: true,
    });
    expect(hasUsableAuthControls()).toBe(false);
  });

  it("stays false when every provider is explicitly turned off", async () => {
    const { hasUsableAuthControls } = await load({
      ...BETTER_AUTH_ONLY,
      NEXT_PUBLIC_FEATURE_AUTH_CREDENTIALS_ENABLED: false,
      NEXT_PUBLIC_FEATURE_AUTH_RESEND_ENABLED: false,
      NEXT_PUBLIC_FEATURE_AUTH_GUEST_ENABLED: false,
      NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED: false,
      NEXT_PUBLIC_FEATURE_AUTH_GOOGLE_ENABLED: false,
      NEXT_PUBLIC_FEATURE_AUTH_TWITTER_ENABLED: false,
      NEXT_PUBLIC_FEATURE_AUTH_DISCORD_ENABLED: false,
      NEXT_PUBLIC_FEATURE_AUTH_GITLAB_ENABLED: false,
      NEXT_PUBLIC_FEATURE_AUTH_BITBUCKET_ENABLED: false,
    });
    expect(hasUsableAuthControls()).toBe(false);
  });
});

describe("getEnabledOAuthProviders", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/env");
  });

  it("returns nothing for a Better-Auth-only deployment", async () => {
    const { getEnabledOAuthProviders } = await load(BETTER_AUTH_ONLY);
    expect(getEnabledOAuthProviders()).toEqual([]);
  });

  it("lists providers in render order", async () => {
    const { getEnabledOAuthProviders } = await load({
      NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED: true,
      NEXT_PUBLIC_FEATURE_AUTH_GOOGLE_ENABLED: true,
    });
    expect(getEnabledOAuthProviders().map((p) => p.id)).toEqual(["google", "github"]);
  });
});

describe("isGuestOnlyAuthMode", () => {
  afterEach(() => {
    vi.resetModules();
    vi.doUnmock("@/env");
  });

  it("is true when guest is the only control, even on Better Auth", async () => {
    const { isGuestOnlyAuthMode } = await load({
      ...BETTER_AUTH_ONLY,
      NEXT_PUBLIC_FEATURE_AUTH_GUEST_ENABLED: true,
    });
    expect(isGuestOnlyAuthMode()).toBe(true);
  });

  it("is false when guest sits alongside an OAuth provider", async () => {
    const { isGuestOnlyAuthMode } = await load({
      NEXT_PUBLIC_FEATURE_AUTH_GUEST_ENABLED: true,
      NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED: true,
    });
    expect(isGuestOnlyAuthMode()).toBe(false);
  });

  it("is false when guest is off", async () => {
    const { isGuestOnlyAuthMode } = await load(BETTER_AUTH_ONLY);
    expect(isGuestOnlyAuthMode()).toBe(false);
  });
});
