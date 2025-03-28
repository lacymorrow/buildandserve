"use client";

import { OAuthButtons } from "@/app/(app)/(authentication)/_components/oauth-buttons";
import { SuspenseFallback } from "@/components/primitives/suspense-fallback";
import { CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { Suspense, useEffect, useState } from "react";

interface AuthFormProps {
	mode?: "sign-in" | "sign-up";
	className?: string;
	children?: React.ReactNode;
	title?: string | React.ReactNode;
	description?: string | React.ReactNode;
	withHeader?: boolean;
	withFooter?: boolean;
}

async function getProviders() {
	const response = await fetch("/api/providers");
	if (!response.ok) {
		console.error("Failed to fetch providers:", await response.text());
		return [];
	}
	return response.json();
}

export  function AuthForm({
	mode = "sign-in",
	className,
	children,
	title,
	description,
	withHeader = true,
	withFooter = true,
	...props
}: AuthFormProps) {
	const isSignIn = mode === "sign-in";
	const cardTitle = typeof title === "string" ? title : (isSignIn ? `Welcome to ${siteConfig.name}` : "Create an account");
	const cardDescription = typeof description === "string" ? description : isSignIn
		? "Login to get started"
		: "Sign up to get started";
	const alternateLink = isSignIn
		? { text: "Don't have an account?", href: routes.auth.signUp, label: "Sign up" }
		: { text: "Already have an account?", href: routes.auth.signIn, label: "Sign in" };

	const [providers, setProviders] = useState<Provider[]>([]);

	useEffect(() => {
		getProviders().then(setProviders);
	}, []);

	return (
		<div className={cn("flex flex-col gap-6 overflow-y-auto", className)} {...props}>
			{withHeader && (
				<CardHeader className="text-center">
					<CardTitle className="text-xl">{cardTitle}</CardTitle>
					<CardDescription>{cardDescription}</CardDescription>
				</CardHeader>
			)}
			<CardContent className="pb-0">
				<div className="grid gap-6 relative">
					{providers.length > 0 ? (
						<OAuthButtons
							collapsible
							variant="icons"
							providers={providers}
						/>
					) : null}

					<Suspense fallback={<SuspenseFallback />}>
						{children}
					</Suspense>
					<div className="text-center text-sm">
						{alternateLink.text}{" "}
						<Link href={alternateLink.href} className="underline underline-offset-4">
							{alternateLink.label}
						</Link>
					</div>
				</div>
			</CardContent>
			{withFooter && (
				<CardFooter>
					<div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
						By signing up, you agree to our <Link href={routes.terms}>Terms of Service</Link> and{" "}
						<Link href={routes.privacy}>Privacy Policy</Link>.
					</div>
				</CardFooter>
			)}
		</div>
	);
}
