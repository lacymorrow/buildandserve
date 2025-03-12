"use client";

import { Icons } from "@/components/assets/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { SEARCH_PARAM_KEYS } from "@/config/search-param-keys";
import { cn } from "@/lib/utils";
import { signInWithOAuthAction } from "@/server/actions/auth";
import { authProviders, orderedProviders } from "@/server/auth.providers";
import { DiscordLogoIcon, GitHubLogoIcon, TwitterLogoIcon } from "@radix-ui/react-icons";
import { IconBrandBitbucket, IconBrandGitlab } from "@tabler/icons-react";
import { cva } from "class-variance-authority";
import { useSearchParams } from "next/navigation";
import { MagicLinkForm } from "./magic-link-form";

const oauthButtonVariants = cva("flex items-center justify-center gap-sm", {
	variants: {
		variant: {
			default: "w-full",
			icons: "w-auto p-2",
		},
	},
	defaultVariants: {
		variant: "default",
	},
});

interface OAuthButtonsProps {
	variant?: "default" | "icons";
	className?: string;
}

interface Provider {
	id: string;
	name: string;
}

export function OAuthButtons({ variant = "default", className }: OAuthButtonsProps) {
	// Redirect back to the page that the user was on before signing in
	const searchParams = useSearchParams();
	const nextUrl = searchParams?.get(SEARCH_PARAM_KEYS.nextUrl);
	const options = nextUrl ? { redirectTo: nextUrl } : {};

	const handleSignIn = (providerId: string) => {
		void signInWithOAuthAction({ providerId, options });
	};

	const MagicLinkContent = () => {
		if (!authProviders.find((provider) => provider.id === "resend")) {
			return null;
		}

		return (
			<div className="space-y-4 pt-4">
				<div className="relative">
					<div className="absolute inset-0 flex items-center">
						<span className="w-full border-t" />
					</div>
					<div className="relative flex justify-center text-xs uppercase">
						<span className="bg-background px-2 text-muted-foreground">
							Or continue with email
						</span>
					</div>
				</div>
				<MagicLinkForm />
			</div>
		);
	};

	return (
		<>
			<div
				className={cn(
					"flex gap-xs w-full",
					variant === "icons" ? "flex-row justify-center" : "flex-col",
					className
				)}
			>
				{Array.from(orderedProviders).map((providerId: string) => {
					const provider = authProviders.find((provider) => provider.id === providerId);

					if (!provider) {
						return null;
					}

					const { id, name } = provider;

					const button = (
						<Button variant={"outline"} type="submit" className={oauthButtonVariants({ variant })}>
							{variant === "default" && <span>Sign in with {name}</span>}
							{id === "google" && <Icons.google className="h-4 w-4" />}
							{id === "twitter" && <TwitterLogoIcon className="h-4 w-4" />}
							{id === "discord" && <DiscordLogoIcon className="h-4 w-4" />}
							{id === "github" && <GitHubLogoIcon className="h-4 w-4" />}
							{id === "gitlab" && <IconBrandGitlab className="h-4 w-4" />}
							{id === "bitbucket" && <IconBrandBitbucket className="h-4 w-4" />}
						</Button>
					);

					return (
						<form
							key={id}
							action={() => {
								handleSignIn(id);
							}}
						>
							{variant === "icons" ? (
								<Tooltip>
									<TooltipTrigger asChild>{button}</TooltipTrigger>
									<TooltipContent>
										<p>Sign in with {name}</p>
									</TooltipContent>
								</Tooltip>
							) : (
								button
							)}
						</form>
					);
				})}
			</div>
			<MagicLinkContent />
		</>
	);
}
