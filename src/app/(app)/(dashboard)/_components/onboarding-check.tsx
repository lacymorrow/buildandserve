"use client";

import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useEffect, useState } from "react";
import { OnboardingWizard } from "./onboarding-wizard";

interface OnboardingCheckProps {
	userId: string;
	hasGitHubConnection?: boolean;
	hasVercelConnection?: boolean;
	hasPurchased?: boolean;
}

export function OnboardingCheck({
	userId,
	hasGitHubConnection = false,
	hasVercelConnection = false,
	hasPurchased = false
}: OnboardingCheckProps) {
	const [showOnboarding, setShowOnboarding] = useState(false);
	const [onboardingState, setOnboardingState] = useLocalStorage<{
		completed: boolean;
		currentStep: number;
		steps: Record<string, boolean>;
	} | null>(`onboarding-${userId}`, null);

	useEffect(() => {
		// Only show onboarding if:
		// 1. User has purchased the starter kit
		// 2. Onboarding hasn't been completed yet
		// 3. We have a valid userId
		if (hasPurchased && userId && (!onboardingState || !onboardingState.completed)) {
			setShowOnboarding(true);
		}
	}, [hasPurchased, userId, onboardingState]);

	const handleOnboardingComplete = () => {
		setShowOnboarding(false);
	};

	if (!showOnboarding) {
		return null;
	}

	return (
		<OnboardingWizard
			userId={userId}
			hasGitHubConnection={hasGitHubConnection}
			hasVercelConnection={hasVercelConnection}
			onComplete={handleOnboardingComplete}
		/>
	);
}

// Separate component for the restart button
export function RestartOnboardingButton({
	userId,
	hasGitHubConnection = false,
	hasVercelConnection = false,
	hasPurchased = false,
	className = ""
}: OnboardingCheckProps & { className?: string }) {
	const [onboardingState, setOnboardingState] = useLocalStorage<{
		completed: boolean;
		currentStep: number;
		steps: Record<string, boolean>;
	} | null>(`onboarding-${userId}`, null);

	const restartOnboarding = () => {
		// Reset the onboarding state to initial values
		setOnboardingState({
			completed: false,
			currentStep: 0,
			steps: {
				github: hasGitHubConnection, // Keep GitHub connection status
				vercel: hasVercelConnection, // Keep Vercel connection status
				deploy: false,
			},
		});
	};

	// Only show the button if onboarding has been completed before
	if (!onboardingState?.completed) {
		return null;
	}

	return (
		<Button
			variant="outline"
			size="sm"
			onClick={restartOnboarding}
			className={className}
		>
			Restart Onboarding
		</Button>
	);
}
