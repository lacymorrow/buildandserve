/**
 * Validate environment variables
 *
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
// NOTE: We are NOT using the validated `env` object from `@/env` here
// because this file runs EARLIER in the build process. We must use raw `process.env`.

// ======== Calculate Feature Flags at Build Time =========
const isDatabaseEnabled = !!process.env.DATABASE_URL;
export const isPayloadEnabled = isDatabaseEnabled && process.env.DISABLE_PAYLOAD !== "true";

const isCredentialsAuthEnabled =
	isPayloadEnabled && process.env.AUTH_CREDENTIALS_ENABLED === "true";

const isResendAuthEnabled = process.env.NODE_ENV !== "production" && !!process.env.AUTH_RESEND_KEY; // TODO: Remove this once we have a production key

const isBitbucketAuthEnabled =
	!!process.env.AUTH_BITBUCKET_ID && !!process.env.AUTH_BITBUCKET_SECRET;
const isDiscordAuthEnabled = !!process.env.AUTH_DISCORD_ID && !!process.env.AUTH_DISCORD_SECRET;
const isGitHubAuthEnabled = !!process.env.AUTH_GITHUB_ID && !!process.env.AUTH_GITHUB_SECRET;
const isGitLabAuthEnabled = !!process.env.AUTH_GITLAB_ID && !!process.env.AUTH_GITLAB_SECRET;
const isGoogleAuthEnabled = !!process.env.AUTH_GOOGLE_ID && !!process.env.AUTH_GOOGLE_SECRET;
const isTwitterAuthEnabled = !!process.env.AUTH_TWITTER_ID && !!process.env.AUTH_TWITTER_SECRET;
const isVercelAuthEnabled = !!process.env.VERCEL_CLIENT_ID && !!process.env.VERCEL_CLIENT_SECRET;

// Builder is enabled if the API key exists and it's not explicitly disabled
export const isBuilderEnabled =
	!!process.env.NEXT_PUBLIC_BUILDER_API_KEY && process.env.DISABLE_BUILDER !== "true";

export const isMDXEnabled = process.env.DISABLE_MDX !== "true";

// ======== External Service Features =========
const isGitHubApiEnabled =
	!!process.env.GITHUB_ACCESS_TOKEN &&
	!!process.env.GITHUB_REPO_OWNER &&
	!!process.env.GITHUB_REPO_NAME;

const isGoogleServiceAccountEnabled =
	!!process.env.GOOGLE_CLIENT_EMAIL && !!process.env.GOOGLE_PRIVATE_KEY;

const isOpenAiEnabled = !!process.env.OPENAI_API_KEY;
const isAnthropicEnabled = !!process.env.ANTHROPIC_API_KEY;

const isLemonSqueezyEnabled =
	!!process.env.LEMONSQUEEZY_API_KEY && !!process.env.LEMONSQUEEZY_STORE_ID;

const isPolarEnabled = !!process.env.POLAR_ACCESS_TOKEN;

const isS3Enabled =
	!!process.env.AWS_REGION &&
	!!process.env.AWS_ACCESS_KEY_ID &&
	!!process.env.AWS_SECRET_ACCESS_KEY &&
	!!process.env.AWS_BUCKET_NAME;

const isRedisEnabled =
	!!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const isVercelApiEnabled = !!process.env.VERCEL_ACCESS_TOKEN;

const isVercelBlobEnabled = !!process.env.BLOB_READ_WRITE_TOKEN;
// ======== Analytics Features ==========
const isPostHogEnabled = !!process.env.NEXT_PUBLIC_POSTHOG_KEY;

const isUmamiEnabled = !!process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID;

// Object containing flags to be injected into process.env
// Use string values as process.env converts everything to strings
export const buildTimeFeatureFlags = {
	NEXT_PUBLIC_FEATURE_DATABASE_ENABLED: String(isDatabaseEnabled),
	NEXT_PUBLIC_FEATURE_PAYLOAD_ENABLED: String(isPayloadEnabled),
	NEXT_PUBLIC_FEATURE_BUILDER_ENABLED: String(isBuilderEnabled),
	NEXT_PUBLIC_FEATURE_MDX_ENABLED: String(isMDXEnabled),

	NEXT_PUBLIC_FEATURE_AUTH_RESEND_ENABLED: String(isResendAuthEnabled),
	NEXT_PUBLIC_FEATURE_AUTH_CREDENTIALS_ENABLED: String(isCredentialsAuthEnabled),
	NEXT_PUBLIC_FEATURE_AUTH_BITBUCKET_ENABLED: String(isBitbucketAuthEnabled),
	NEXT_PUBLIC_FEATURE_AUTH_DISCORD_ENABLED: String(isDiscordAuthEnabled),
	NEXT_PUBLIC_FEATURE_AUTH_GITHUB_ENABLED: String(isGitHubAuthEnabled),
	NEXT_PUBLIC_FEATURE_AUTH_GITLAB_ENABLED: String(isGitLabAuthEnabled),
	NEXT_PUBLIC_FEATURE_AUTH_GOOGLE_ENABLED: String(isGoogleAuthEnabled),
	NEXT_PUBLIC_FEATURE_AUTH_TWITTER_ENABLED: String(isTwitterAuthEnabled),
	NEXT_PUBLIC_FEATURE_AUTH_VERCEL_ENABLED: String(isVercelAuthEnabled),

	// External Services
	NEXT_PUBLIC_FEATURE_GITHUB_API_ENABLED: String(isGitHubApiEnabled),
	NEXT_PUBLIC_FEATURE_GOOGLE_SERVICE_ACCOUNT_ENABLED: String(isGoogleServiceAccountEnabled),
	NEXT_PUBLIC_FEATURE_OPENAI_ENABLED: String(isOpenAiEnabled),
	NEXT_PUBLIC_FEATURE_ANTHROPIC_ENABLED: String(isAnthropicEnabled),
	NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED: String(isLemonSqueezyEnabled),
	NEXT_PUBLIC_FEATURE_POLAR_ENABLED: String(isPolarEnabled),
	NEXT_PUBLIC_FEATURE_S3_ENABLED: String(isS3Enabled),
	NEXT_PUBLIC_FEATURE_REDIS_ENABLED: String(isRedisEnabled),
	NEXT_PUBLIC_FEATURE_VERCEL_API_ENABLED: String(isVercelApiEnabled),
	NEXT_PUBLIC_FEATURE_VERCEL_BLOB_ENABLED: String(isVercelBlobEnabled),

	// Analytics
	NEXT_PUBLIC_FEATURE_POSTHOG_ENABLED: String(isPostHogEnabled),
	NEXT_PUBLIC_FEATURE_UMAMI_ENABLED: String(isUmamiEnabled),
};
// =======================================================
