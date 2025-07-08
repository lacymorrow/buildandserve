"use client";

import { Button } from "@/components/ui/button";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ResetIcon } from "@radix-ui/react-icons";
import type { User } from "@/types/user";
import { useEffect, useState } from "react";
import { OnboardingWizard } from "./onboarding-wizard";

interface OnboardingCheckProps {
	user?: User | null;
	hasGitHubConnection?: boolean;
	hasVercelConnection?: boolean;
	hasPurchased?: boolean;
}

export function OnboardingCheck({
	user,
	hasGitHubConnection = false,
	hasVercelConnection = false,
	hasPurchased = false
}: OnboardingCheckProps) {
	const userId = user?.id ?? "";
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

	if (!showOnboarding || !user) {
		return null;
	}

	return (
		<OnboardingWizard
			user={user}
			hasGitHubConnection={hasGitHubConnection}
			hasVercelConnection={hasVercelConnection}
			onComplete={handleOnboardingComplete}
		/>
	);
}

// Separate component for the restart button
export function RestartOnboardingButton({
	user,
	hasGitHubConnection = false,
	hasVercelConnection = false,
	className = ""
}: OnboardingCheckProps & { className?: string }) {
	const [onboardingState, setOnboardingState] = useLocalStorage<{
		completed: boolean;
		currentStep: number;
		steps: Record<string, boolean>;
	} | null>(`onboarding-${user?.id}`, null);

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
		window?.location?.reload();
	};

	// Only show the button if onboarding has been completed before
	if (!onboardingState?.completed) {
		return null;
	}

	return (
		<Button
			type="button"
			variant="ghost"
			onClick={restartOnboarding}
			className={className}
		>
			<ResetIcon className="mr-2 size-4" />
			Restart Onboarding
		</Button>
	);
}
