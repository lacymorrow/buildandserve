"use client";

import { GitHubConnectButton } from "@/components/buttons/github-connect-button";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeWindow } from "@/components/ui/code-window";
import { Progress } from "@/components/ui/progress";
import { siteConfig } from "@/config/site";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { CheckIcon, GithubIcon } from "lucide-react";
import { useState } from "react";

// Define the onboarding steps
const STEPS = [
	{
		id: "github",
		title: "Connect GitHub",
		description: "Link your GitHub account to manage your codebase",
	},
	{
		id: "vercel",
		title: "Connect Vercel",
		description: "Link your Vercel account for deployment",
	},
	{
		id: "deploy",
		title: "Deploy Your Project",
		description: "Launch your site with one-click deployment",
	},
];

// Installation code snippet
const installationCode = `# Clone the repository
git clone ${siteConfig.repo.url}

# Change directory
cd shipkit

# Install dependencies
pnpm install

# Start the development server
pnpm dev`;

// Deployment code snippet
const deploymentCode = `# Build your project
pnpm build

# Deploy to Vercel
vercel deploy`;

interface OnboardingWizardProps {
	userId: string;
	hasGitHubConnection?: boolean;
	hasVercelConnection?: boolean;
	onComplete?: () => void;
}

export function OnboardingWizard({
	userId,
	hasGitHubConnection = false,
	hasVercelConnection = false,
	onComplete
}: OnboardingWizardProps) {
	// Check if onboarding has been completed
	const [onboardingState, setOnboardingState] = useLocalStorage<{
		completed: boolean;
		currentStep: number;
		steps: Record<string, boolean>;
	}>(`onboarding-${userId}`, {
		completed: false,
		currentStep: 0,
		steps: {
			github: hasGitHubConnection,
			vercel: hasVercelConnection,
			deploy: false,
		},
	});

	// Initialize currentStep from onboardingState only once
	const [currentStep, setCurrentStep] = useState(onboardingState.currentStep);
	const { toast } = useToast();

	// Update onboardingState when step changes, but avoid the useEffect for this
	const updateStep = (newStep: number) => {
		setCurrentStep(newStep);
		setOnboardingState(prev => ({
			...prev,
			currentStep: newStep,
		}));
	};

	// Mark a step as completed
	const completeStep = (stepId: string) => {
		setOnboardingState(prev => ({
			...prev,
			steps: {
				...prev.steps,
				[stepId]: true,
			},
		}));
	};

	// Navigate to the next step
	const nextStep = () => {
		if (currentStep < STEPS.length - 1) {
			completeStep(STEPS[currentStep].id);
			updateStep(currentStep + 1);
		} else {
			completeOnboarding();
		}
	};

	// Navigate to the previous step
	const prevStep = () => {
		if (currentStep > 0) {
			updateStep(currentStep - 1);
		}
	};

	// Complete the onboarding process
	const completeOnboarding = () => {
		completeStep(STEPS[currentStep].id);
		setOnboardingState(prev => ({
			...prev,
			completed: true,
		}));

		toast({
			title: "Onboarding completed!",
			description: "You're all set to start building with ShipKit.",
		});

		if (onComplete) {
			onComplete();
		}
	};

	// Skip onboarding
	const skipOnboarding = () => {
		setOnboardingState(prev => ({
			...prev,
			completed: true,
		}));

		if (onComplete) {
			onComplete();
		}
	};

	// Calculate progress percentage
	const progress = Math.round(
		(Object.values(onboardingState.steps).filter(Boolean).length / STEPS.length) * 100
	);

	// If onboarding is already completed, don't show the wizard
	if (onboardingState.completed) {
		return null;
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
			<Card className="w-full max-w-3xl shadow-lg">
				<CardHeader>
					<div className="flex items-center justify-between">
						<div>
							<CardTitle className="text-2xl">{STEPS[currentStep].title}</CardTitle>
							<CardDescription>{STEPS[currentStep].description}</CardDescription>
						</div>
						<div className="flex items-center gap-2">
							<span className="text-sm text-muted-foreground">
								Step {currentStep + 1} of {STEPS.length}
							</span>
							<Button variant="ghost" size="sm" onClick={skipOnboarding}>
								Skip
							</Button>
						</div>
					</div>
					<Progress value={progress} className="h-2" />
				</CardHeader>

				<CardContent>
					<AnimatePresence mode="wait">
						<motion.div
							key={currentStep}
							initial={{ opacity: 0, x: 20 }}
							animate={{ opacity: 1, x: 0 }}
							exit={{ opacity: 0, x: -20 }}
							transition={{ duration: 0.2 }}
							className="min-h-[300px]"
						>
							{/* GitHub Connection Step */}
							{currentStep === 0 && (
								<div className="space-y-6">
									<div className="rounded-lg border p-6">
										<div className="flex items-start gap-4">
											<div className="rounded-full bg-muted p-2">
												<GithubIcon className="h-6 w-6" />
											</div>
											<div>
												<h3 className="font-semibold">Connect your GitHub account</h3>
												<p className="text-sm text-muted-foreground mt-1">
													Connecting GitHub allows you to easily manage your codebase, track changes,
													and deploy your site directly from your repository.
												</p>

												{hasGitHubConnection ? (
													<div className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
														<CheckIcon className="h-4 w-4" />
														<span>GitHub account connected</span>
													</div>
												) : (
													<GitHubConnectButton className="mt-4" />
												)}
											</div>
										</div>
									</div>

									<div className="rounded-lg border">
										<div className="p-4 border-b">
											<h4 className="font-medium">Clone the repository</h4>
										</div>
										<div className="p-4">
											<CodeWindow language="bash" code={installationCode} />
										</div>
									</div>
								</div>
							)}

							{/* Vercel Connection Step */}
							{currentStep === 1 && (
								<div className="space-y-6">
									<div className="rounded-lg border p-6">
										<div className="flex items-start gap-4">
											<div className="rounded-full bg-muted p-2">
												<svg
													width="16"
													height="16"
													viewBox="0 0 116 100"
													fill="currentColor"
													xmlns="http://www.w3.org/2000/svg"
													className="h-6 w-6"
												>
													<path
														fillRule="evenodd"
														clipRule="evenodd"
														d="M57.5 0L115 100H0L57.5 0Z"
													/>
												</svg>
											</div>
											<div>
												<h3 className="font-semibold">Connect your Vercel account</h3>
												<p className="text-sm text-muted-foreground mt-1">
													Link your Vercel account to enable one-click deployments, preview environments,
													and continuous integration.
												</p>

												{hasVercelConnection ? (
													<div className="mt-4 flex items-center gap-2 text-sm text-green-600 dark:text-green-500">
														<CheckIcon className="h-4 w-4" />
														<span>Vercel account connected</span>
													</div>
												) : (
													<Button className="mt-4" variant="outline">
														Connect Vercel
													</Button>
												)}
											</div>
										</div>
									</div>

									<div className="rounded-lg bg-muted p-4">
										<h4 className="font-medium mb-2">Benefits of Vercel</h4>
										<ul className="space-y-2 text-sm">
											<li className="flex items-center gap-2">
												<CheckIcon className="h-4 w-4 text-green-600 dark:text-green-500" />
												<span>Automatic deployments from Git</span>
											</li>
											<li className="flex items-center gap-2">
												<CheckIcon className="h-4 w-4 text-green-600 dark:text-green-500" />
												<span>Preview deployments for pull requests</span>
											</li>
											<li className="flex items-center gap-2">
												<CheckIcon className="h-4 w-4 text-green-600 dark:text-green-500" />
												<span>Custom domains and SSL certificates</span>
											</li>
										</ul>
									</div>
								</div>
							)}

							{/* Deploy Step */}
							{currentStep === 2 && (
								<div className="space-y-6">
									<div className="rounded-lg border p-6">
										<div className="flex items-start gap-4">
											<div className="rounded-full bg-muted p-2">
												<svg
													width="16"
													height="16"
													viewBox="0 0 116 100"
													fill="currentColor"
													xmlns="http://www.w3.org/2000/svg"
													className="h-6 w-6"
												>
													<path
														fillRule="evenodd"
														clipRule="evenodd"
														d="M57.5 0L115 100H0L57.5 0Z"
													/>
												</svg>
											</div>
											<div>
												<h3 className="font-semibold">Deploy your project</h3>
												<p className="text-sm text-muted-foreground mt-1">
													Deploy your Next.js application to Vercel with just a few clicks.
													Your project will be live and accessible to everyone instantly.
												</p>

												<Button className="mt-4" variant="outline">
													Deploy to Vercel
												</Button>
											</div>
										</div>
									</div>

									<div className="rounded-lg border">
										<div className="p-4 border-b">
											<h4 className="font-medium">Manual deployment</h4>
										</div>
										<div className="p-4">
											<CodeWindow language="bash" code={deploymentCode} />
										</div>
									</div>

									<div className="rounded-lg bg-primary/10 p-4 text-center">
										<h3 className="font-semibold">Almost there!</h3>
										<p className="text-sm text-muted-foreground mt-1">
											Once deployed, your site will be available at your custom domain or a Vercel-provided URL.
											Click "Finish" below to complete the onboarding process.
										</p>
									</div>
								</div>
							)}
						</motion.div>
					</AnimatePresence>
				</CardContent>

				<CardFooter className="flex justify-between border-t p-6">
					<Button
						variant="outline"
						onClick={prevStep}
						disabled={currentStep === 0}
					>
						Previous
					</Button>

					<Button onClick={currentStep === STEPS.length - 1 ? completeOnboarding : nextStep}>
						{currentStep === STEPS.length - 1 ? "Finish" : "Next"}
					</Button>
				</CardFooter>
			</Card>
		</div>
	);
}
