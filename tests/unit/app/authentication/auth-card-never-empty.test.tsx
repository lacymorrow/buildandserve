import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TooltipProvider } from "@/components/ui/tooltip";

/**
 * Regression cover for LAC-4265.
 *
 * townofharmony.org shipped `/sign-in` and `/sign-up` as a card with a heading,
 * a subtitle, a link to the other dead page, and nothing to click: zero inputs,
 * zero OAuth buttons, zero submit buttons, desktop and mobile.
 *
 * `NEXT_PUBLIC_FEATURE_AUTH_ENABLED` was true the whole time. Better Auth turns
 * itself on from `APP_SECRET` plus a database, which every Shipkit downstream
 * has, and it contributes no control to the card. The invariant below is the one
 * that was violated: the card renders a usable control, or it says sign-in is
 * unavailable. Never a hole.
 */

const UNAVAILABLE = /Login and sign-up are not available at this time/i;

vi.mock("@/server/actions/auth", () => ({
  signInWithOAuthAction: vi.fn(),
  signInWithCredentialsAction: vi.fn(),
  signInWithMagicLinkAction: vi.fn(),
  signUpWithCredentialsAction: vi.fn(),
  signInAsGuestAction: vi.fn(),
}));

/** Better Auth on, no Auth.js provider: townofharmony.org prod. */
const BETTER_AUTH_ONLY = {
  NEXT_PUBLIC_FEATURE_AUTH_ENABLED: true,
  NEXT_PUBLIC_FEATURE_AUTH_METHODS_ENABLED: true,
  NEXT_PUBLIC_FEATURE_BETTER_AUTH_ENABLED: true,
};

const renderCard = async (
  which: "sign-in" | "sign-up",
  flags: Record<string, boolean | string | undefined>
) => {
  vi.resetModules();
  vi.doMock("@/env", () => ({ env: flags }));

  if (which === "sign-in") {
    const { SignIn } = await import("@/app/(app)/(authentication)/sign-in/_components/sign-in");
    render(
      <TooltipProvider>
        <SignIn />
      </TooltipProvider>
    );
    return;
  }

  const { SignUp } = await import("@/app/(app)/(authentication)/sign-up/_components/sign-up");
  render(
    <TooltipProvider>
      <SignUp />
    </TooltipProvider>
  );
};

/** Anything a visitor could use to get in. */
const countControls = () =>
  screen.queryAllByRole("textbox").length +
  screen.queryAllByRole("button").length +
  document.querySelectorAll("input").length;

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("@/env");
});

describe.each(["sign-in", "sign-up"] as const)("%s card", (which) => {
  it("says sign-in is unavailable when Better Auth is the only thing enabled", async () => {
    await renderCard(which, BETTER_AUTH_ONLY);

    expect(screen.getByText(UNAVAILABLE)).toBeInTheDocument();
    expect(countControls()).toBe(0);
  });

  it("never renders a card with neither a control nor the unavailable copy", async () => {
    await renderCard(which, BETTER_AUTH_ONLY);

    const hasControl = countControls() > 0;
    const saysUnavailable = screen.queryByText(UNAVAILABLE) !== null;
    expect(hasControl || saysUnavailable).toBe(true);
  });

  it("drops the cross-link to the other auth page when there is no way in", async () => {
    await renderCard(which, BETTER_AUTH_ONLY);

    expect(screen.queryByRole("link", { name: /sign up|sign in/i })).toBeNull();
  });

  it("renders the OAuth button and no unavailable copy once GitHub is configured", async () => {
    await renderCard(which, {
      ...BETTER_AUTH_ONLY,
      NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED: true,
    });

    expect(screen.queryByText(UNAVAILABLE)).toBeNull();
    expect(countControls()).toBeGreaterThan(0);
  });
});
