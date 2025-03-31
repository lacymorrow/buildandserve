import { env } from "@/env";

// Define details for all possible providers in the desired UI display order.
// This list determines the base order.
const allProviderDetails = [
	// Primary OAuth
	{ id: "google", name: "Google" }, // Requires FEATURE_AUTH_GOOGLE_ENABLED
	{ id: "twitter", name: "Twitter" }, // Requires FEATURE_AUTH_TWITTER_ENABLED
	{ id: "discord", name: "Discord" }, // Requires FEATURE_AUTH_DISCORD_ENABLED
	{ id: "github", name: "GitHub" }, // Requires FEATURE_AUTH_GITHUB_ENABLED
	{ id: "gitlab", name: "GitLab" }, // Requires FEATURE_AUTH_GITLAB_ENABLED
	{ id: "bitbucket", name: "Bitbucket" }, // Requires FEATURE_AUTH_BITBUCKET_ENABLED
	// Other Auth Methods
	{ id: "credentials", name: "Credentials" }, // Requires FEATURE_AUTH_CREDENTIALS_ENABLED
	{ id: "resend", name: "Resend" }, // Requires FEATURE_AUTH_RESEND_ENABLED
	// Account Linking Only
	{ id: "vercel", name: "Vercel" }, // Requires FEATURE_AUTH_VERCEL_ENABLED
];

// Helper type for feature flag keys
type FeatureFlagKey = Extract<keyof typeof env, `NEXT_PUBLIC_FEATURE_AUTH_${string}_ENABLED`>;

// Helper object to map feature flag names to provider IDs
const flagToProviderId: { [K in FeatureFlagKey]?: string } = {
	NEXT_PUBLIC_FEATURE_AUTH_GOOGLE_ENABLED: "google",
	NEXT_PUBLIC_FEATURE_AUTH_TWITTER_ENABLED: "twitter",
	NEXT_PUBLIC_FEATURE_AUTH_DISCORD_ENABLED: "discord",
	NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED: "github",
	NEXT_PUBLIC_FEATURE_AUTH_GITLAB_ENABLED: "gitlab",
	NEXT_PUBLIC_FEATURE_AUTH_BITBUCKET_ENABLED: "bitbucket",
	NEXT_PUBLIC_FEATURE_AUTH_CREDENTIALS_ENABLED: "credentials",
	NEXT_PUBLIC_FEATURE_AUTH_RESEND_ENABLED: "resend",
	NEXT_PUBLIC_FEATURE_AUTH_VERCEL_ENABLED: "vercel",
};

// Filter the details based on enabled features, preserving the order from allProviderDetails
export const availableProviderDetails = allProviderDetails.filter((provider) => {
	// Find the flag corresponding to this provider ID
	const flagName = Object.keys(flagToProviderId).find(
		(key) => flagToProviderId[key as FeatureFlagKey] === provider.id
	) as FeatureFlagKey | undefined;

	// If a flag exists for this provider, check if it's true in the env
	return flagName ? env[flagName] === true : false;
});

// Export just the IDs of available providers for use in server/auth.providers.ts
export const availableProviderIds = availableProviderDetails.map((p) => p.id);

// --- Constants for UI ---

// Prevent these specific providers from being shown as sign-in buttons in the UI
// They might still be enabled for other purposes (e.g., magic link, account linking)
export const EXCLUDED_PROVIDERS_UI = ["credentials", "resend", "vercel"];

// --- Generate the list for UI display ---

// Create the final list for UI components (buttons, etc.)
// This list respects the defined order and marks excluded providers.
export const enabledAuthProviders = availableProviderDetails.map((provider) => {
	// Add the exclusion flag for UI purposes
	const isExcluded = EXCLUDED_PROVIDERS_UI.includes(provider.id);
	return { ...provider, isExcluded };
}) as Array<{
	id: string;
	name: string;
	isExcluded: boolean;
}>;
// Optionally filter out excluded providers entirely if the UI should never reference them
// .filter(provider => !provider.isExcluded)
// Note: Currently keeping excluded providers in the list but marked,
// allowing UI logic to decide whether to render them conditionally.
// If they should *never* appear, uncomment the .filter line above.

// --- Deprecated ---
// The logic for generating the list of UI-displayable providers
// (including ordering and exclusion) is now handled above.
// UI components should import `enabledAuthProviders` from here.

// Example Usage in UI:
// import { enabledAuthProviders } from '@/config/auth-provider-details';
//
// enabledAuthProviders.map(provider => (
//   !provider.isExcluded && <button key={provider.id}>Sign in with {provider.name}</button>
// ))
