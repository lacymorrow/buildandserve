import { EXCLUDED_PROVIDERS, authProviders, orderedProviders } from "@/server/auth.providers";
import "server-only";

/**
 * Service for handling auth provider information
 * This allows us to keep server-side auth provider logic separate from client components
 */
export const AuthProviderService = {
	/**
	 * Get all available auth providers
	 */
	async getAuthProviders() {
		return authProviders.map((provider) => ({
			id: provider?.id,
			name: provider?.name,
		}));
	},

	/**
	 * Get ordered auth providers (filtered to exclude certain providers)
	 */
	async getOrderedProviders() {
		return orderedProviders;
	},

	/**
	 * Check if a specific provider is available
	 */
	async hasProvider(providerId: string) {
		return authProviders.some((provider) => provider.id === providerId);
	},

	/**
	 * Check if a provider should be excluded from buttons
	 */
	async isExcludedProvider(providerId: string) {
		return EXCLUDED_PROVIDERS.includes(providerId);
	},
};
