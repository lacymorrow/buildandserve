import { env } from "@/env";

/**
 * What the sign-in and sign-up cards can actually put on screen.
 *
 * `NEXT_PUBLIC_FEATURE_AUTH_ENABLED` and `NEXT_PUBLIC_FEATURE_AUTH_METHODS_ENABLED`
 * are the wrong question to ask here. Both go true for Better Auth, Clerk,
 * Stack and Supabase, and Better Auth turns itself on from `APP_SECRET` plus a
 * database, which every Shipkit downstream already has. None of those four
 * contribute a button, an input, or an OAuth link to the card: the card only
 * renders the Auth.js provider flags, the Payload credentials form, the Resend
 * magic link form, and the guest form.
 *
 * So townofharmony.org shipped a card with a heading, a subtitle, a link to the
 * other dead page, and nothing to click. The flags were all true and the card
 * was empty. This module answers the question the UI is actually asking: is
 * there one control a visitor can use?
 */

export interface OAuthProvider {
  id: string;
  name: string;
}

/**
 * Flags the auth card branches on, named for what the visitor sees rather than
 * for the provider underneath. Pure input so the predicates below can be tested
 * without an environment.
 */
export interface AuthUiFlags {
  /** Email + password, backed by Payload. */
  credentials: boolean;
  /** Email magic link, backed by Resend. */
  magicLink: boolean;
  /** Name-only guest sign-in. */
  guest: boolean;
  /** OAuth providers that have a button. */
  oauthProviders: readonly OAuthProvider[];
}

/**
 * OAuth providers in the order the card renders them. Single source of truth:
 * `oauth-buttons.tsx` maps over this, and the availability predicates count it,
 * so "what renders" and "what we claim renders" cannot drift apart.
 */
export const getEnabledOAuthProviders = (): OAuthProvider[] => {
  const providers: OAuthProvider[] = [];

  if (env.NEXT_PUBLIC_FEATURE_AUTH_GOOGLE_ENABLED) {
    providers.push({ id: "google", name: "Google" });
  }
  if (env.NEXT_PUBLIC_FEATURE_AUTH_TWITTER_ENABLED) {
    providers.push({ id: "twitter", name: "Twitter" });
  }
  if (env.NEXT_PUBLIC_FEATURE_AUTH_DISCORD_ENABLED) {
    providers.push({ id: "discord", name: "Discord" });
  }
  if (env.NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED) {
    providers.push({ id: "github", name: "GitHub" });
  }
  if (env.NEXT_PUBLIC_FEATURE_AUTH_GITLAB_ENABLED) {
    providers.push({ id: "gitlab", name: "GitLab" });
  }
  if (env.NEXT_PUBLIC_FEATURE_AUTH_BITBUCKET_ENABLED) {
    providers.push({ id: "bitbucket", name: "Bitbucket" });
  }

  return providers;
};

export const getAuthUiFlags = (): AuthUiFlags => ({
  credentials: !!env.NEXT_PUBLIC_FEATURE_AUTH_CREDENTIALS_ENABLED,
  magicLink: !!env.NEXT_PUBLIC_FEATURE_AUTH_RESEND_ENABLED,
  guest: !!env.NEXT_PUBLIC_FEATURE_AUTH_GUEST_ENABLED,
  oauthProviders: getEnabledOAuthProviders(),
});

/**
 * Whether the card has at least one control a visitor can use. When this is
 * false the only honest thing to render is the unavailable message.
 */
export const hasUsableAuthControls = (flags: AuthUiFlags = getAuthUiFlags()): boolean =>
  flags.credentials || flags.magicLink || flags.guest || flags.oauthProviders.length > 0;

/**
 * Guest is the only way in, so it gets the whole screen instead of sitting
 * under a divider with nothing above it.
 *
 * Derived from the controls that render, not from
 * `NEXT_PUBLIC_FEATURE_AUTH_METHODS_ENABLED`: that flag counts Better Auth as a
 * sign-in method, so a guest demo on a Better Auth downstream used to render
 * "Or try it as a guest" under an empty divider.
 */
export const isGuestOnlyAuthMode = (flags: AuthUiFlags = getAuthUiFlags()): boolean =>
  flags.guest && !flags.credentials && !flags.magicLink && flags.oauthProviders.length === 0;
