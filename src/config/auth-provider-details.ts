import { env } from "@/env";

// Define details for all possible providers
// We derive the final enabled list based on feature flags
const allProviderDetails = [
	{ id: "credentials", name: "Credentials" }, // Requires FEATURE_AUTH_CREDENTIALS_ENABLED
	{ id: "resend", name: "Resend" }, // Requires FEATURE_AUTH_RESEND_ENABLED
	{ id: "github", name: "GitHub" }, // Requires FEATURE_AUTH_GITHUB_ENABLED
	{ id: "google", name: "Google" }, // Requires FEATURE_AUTH_GOOGLE_ENABLED
	{ id: "discord", name: "Discord" }, // Requires FEATURE_AUTH_DISCORD_ENABLED
	{ id: "gitlab", name: "GitLab" }, // Requires FEATURE_AUTH_GITLAB_ENABLED
	{ id: "bitbucket", name: "Bitbucket" }, // Requires FEATURE_AUTH_BITBUCKET_ENABLED
	{ id: "twitter", name: "Twitter" }, // Requires FEATURE_AUTH_TWITTER_ENABLED
	{ id: "vercel", name: "Vercel" }, // Requires FEATURE_AUTH_VERCEL_ENABLED
];

// Helper type for feature flag keys
type FeatureFlagKey = Extract<keyof typeof env, `NEXT_PUBLIC_FEATURE_AUTH_${string}`>;

// Helper object to map specific feature flag names to provider IDs
const flagToProviderId: { [K in FeatureFlagKey]?: string } = {
	// Map feature flags to their corresponding provider ID
	NEXT_PUBLIC_FEATURE_AUTH_CREDENTIALS_ENABLED: "credentials",
	NEXT_PUBLIC_FEATURE_AUTH_RESEND_ENABLED: "resend",
	NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED: "github",
	NEXT_PUBLIC_FEATURE_AUTH_GOOGLE_ENABLED: "google",
	NEXT_PUBLIC_FEATURE_AUTH_DISCORD_ENABLED: "discord",
	NEXT_PUBLIC_FEATURE_AUTH_GITLAB_ENABLED: "gitlab",
	NEXT_PUBLIC_FEATURE_AUTH_BITBUCKET_ENABLED: "bitbucket",
	NEXT_PUBLIC_FEATURE_AUTH_TWITTER_ENABLED: "twitter",
	NEXT_PUBLIC_FEATURE_AUTH_VERCEL_ENABLED: "vercel",
	// Add mappings for any other flags if necessary...
};

// Filter the details based on enabled features
const availableProviderDetails = allProviderDetails.filter((provider) => {
	// Find the flag corresponding to this provider ID
	const flagName = Object.keys(flagToProviderId).find(
		(key) => flagToProviderId[key as FeatureFlagKey] === provider.id
	) as FeatureFlagKey | undefined;

	// If a flag exists for this provider, check if it's true in the env
	return flagName ? env[flagName] : false; // env[flagName] is already boolean
});

// --- Constants moved from auth.providers.ts ---

// Prevent these providers from being shown as buttons in the UI
export const EXCLUDED_PROVIDERS_UI = ["credentials", "resend", "vercel"];

// Order provider buttons - These will be shown first in the UI
export const ORDERED_PROVIDERS_UI = [
	"credentials", // Even if excluded, keep for potential conditional logic
	"google",
	"twitter",
	"discord",
	"github",
	"gitlab",
	"bitbucket",
];

// --- Logic moved and adapted from auth.providers.ts ---

// Get just the IDs of the available providers
const availableProviderIds = availableProviderDetails.map((provider) => provider.id);

// Create the ordered list for UI display
export const enabledAuthProviders = [
	// Start with ordered providers that are available
	...ORDERED_PROVIDERS_UI.filter((providerId) => availableProviderIds.includes(providerId)),
	// Then add any remaining available providers that weren't in the specific order
	...availableProviderIds.filter((providerId) => !ORDERED_PROVIDERS_UI.includes(providerId)),
]
	// Map the ordered IDs back to their full details
	.map((providerId) => {
		const provider = availableProviderDetails.find((p) => p.id === providerId);
		if (!provider) {
			return null; // Should not happen if logic is correct
		}

		// Add the exclusion flag for UI purposes
		if (EXCLUDED_PROVIDERS_UI.includes(provider.id)) {
			return { ...provider, isExcluded: true };
		}

		return provider;
	})
	// Filter out any nulls (safety check)
	.filter(Boolean) as Array<{
	id: string;
	name: string;
	isExcluded?: boolean;
}>;
