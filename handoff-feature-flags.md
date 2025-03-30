# Feature Flag Implementation Handoff

This document summarizes the progress made in implementing build-time feature flags based on environment variables and outlines the remaining tasks.

## Completed Tasks

1. **Centralized Feature Flag Logic:**
    * Created `src/config/features-config.ts` to calculate boolean feature status based on raw `process.env` variables at build time.
    * Calculated flags for: Database, Payload CMS, Builder.io, MDX, Auth Providers (Resend, Credentials, Bitbucket, Discord, GitHub, GitLab, Google, Twitter, Vercel), GitHub API, Google Service Account, OpenAI, Anthropic, LemonSqueezy, Polar, S3, Redis, Vercel API, PostHog, Umami.
2. **Build-Time Injection:**
    * Imported `buildTimeFeatureFlags` into `next.config.ts`.
    * Prefixed all flag keys with `NEXT_PUBLIC_`.
    * Injected these prefixed string flags (`"true"`/`"false"`) into `process.env` using the `env` property in `next.config.ts`.
3. **Environment Validation (`src/env.ts`):**
    * Added schema definitions for all `NEXT_PUBLIC_FEATURE_...` flags to the `client` schema.
    * Used a Zod transform (`zBooleanFeatureFlag`) to validate and convert the injected string flags back to booleans.
    * Mapped these flags in `runtimeEnv` for type-safe access via the `env` object.
4. **Auth Provider Refactoring:**
    * Refactored `src/server/auth.providers.ts` to use `env.NEXT_PUBLIC_FEATURE_AUTH_...` flags for conditionally adding providers.
    * Created `src/config/auth-provider-details.ts` to generate a client-safe list (`enabledAuthProviders`) of available providers for UI purposes (filtering, ordering, exclusion) based on feature flags.
    * Updated `src/app/(app)/(authentication)/_components/oauth-buttons.tsx` to import and use `enabledAuthProviders`.
5. **S3 Integration Conditional:**
    * Updated `payload.config.ts` S3 storage plugin logic to use `isS3FeatureEnabled` (derived from raw `process.env` within `payload.config.ts` as it runs early).
    * Updated `src/server/services/s3.ts` to initialize the client and perform operations only if `env.NEXT_PUBLIC_FEATURE_S3_ENABLED` is true.
    * Modified `src/components/inputs/file-upload.tsx` (`FileDropzone`) to accept an `enabled` prop (intended to be passed from a parent Server Component checking the flag) to disable UI/functionality.
6. **LemonSqueezy Integration Conditional:**
    * Updated `src/server/providers/lemonsqueezy-provider.ts` (`validateConfig`) to check `env.NEXT_PUBLIC_FEATURE_LEMONSQUEEZY_ENABLED`.
    * Updated `src/lib/lemonsqueezy.ts` (`configureLemonSqueezy` and exported functions) to check the flag and return early/empty if disabled.
    * Updated `src/server/actions/payments.ts` (`createLemonSqueezyPayment`) to check the flag.
    * Updated `src/server/providers/index.ts` to conditionally register/initialize the LemonSqueezy provider.
    * Modified `src/components/buttons/buy-button.tsx` to accept an `enabled` prop for conditional rendering.

## Paused / Needs Revisit

* **Redis Refactoring:** Attempted to centralize Redis client initialization in `src/server/services/redis-service.ts` and update consumers (`cache-service.ts`, `rate-limit-service.ts`, etc.). Encountered persistent linter/type errors in `cache-service.ts` during refactoring. Reverted changes related to Redis in `cache-service.ts` to proceed. The goal is still to make Redis usage conditional based on `env.NEXT_PUBLIC_FEATURE_REDIS_ENABLED`.

## Remaining Tasks

1. **Make Remaining Integrations Conditional:** Go through the codebase and apply similar conditional logic using the relevant `env.NEXT_PUBLIC_FEATURE_..._ENABLED` flags for:
    * Polar Payments (`src/server/providers/polar-provider.ts`, `src/lib/polar.ts`, relevant actions/components)
    * PostHog Analytics (Check initialization points, e.g., `src/components/providers/posthog-provider.tsx`)
    * Umami Analytics (Check initialization points)
    * OpenAI (Check service/client initialization)
    * Anthropic (Check service/client initialization)
    * GitHub API (Check service initialization/usage)
    * Google Service Account (Check service initialization/usage)
    * Vercel API (Check service initialization/usage)
2. **Revisit Redis Refactoring:** Debug the issues in `src/server/services/cache-service.ts` and complete the refactoring to use the centralized `redis-service.ts`, ensuring all Redis usage is conditional on `env.NEXT_PUBLIC_FEATURE_REDIS_ENABLED`.
3. **Client Component Conditionals:** Identify and update parent Server Components for any client components that rely on these features (like payment buttons, analytics scripts, specific API callers) to pass down the appropriate `enabled` prop based on the corresponding `env.NEXT_PUBLIC_FEATURE_...` flag.
4. **Testing:** Ensure features gracefully degrade or are hidden when disabled via environment variables/feature flags.
