'use client'
import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'
import { useEffect } from 'react'
import PostHogPageView from './posthog-page-view'
import { env } from '@/env'
export function PostHogProvider({ children }: { children: React.ReactNode }) {
	// Check if the PostHog feature is explicitly enabled
	if (!env.NEXT_PUBLIC_FEATURE_POSTHOG_ENABLED) {
		return children // Return children directly if the feature is disabled
	}

	const posthogKey = env?.NEXT_PUBLIC_POSTHOG_KEY
	const posthogHost = env?.NEXT_PUBLIC_POSTHOG_HOST

	// Also check if keys are actually present (belt and suspenders)
	if (!posthogKey || !posthogHost) {
		console.warn("PostHog feature is enabled but keys are missing.")
		return children
	}

	useEffect(() => {
		posthog.init(posthogKey, {
			api_host: posthogHost,
			person_profiles: 'identified_only', // or 'always' to create profiles for anonymous users as well
		})
	}, [])

	return (
		<PHProvider client={posthog}>
			<PostHogPageView />
			{children}
		</PHProvider>
	)
}
