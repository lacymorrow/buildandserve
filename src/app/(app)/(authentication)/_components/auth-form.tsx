import { type ComponentPropsWithoutRef, type ReactNode, Suspense } from "react";

import { OAuthButtons } from "@/app/(app)/(authentication)/_components/oauth-buttons";
import { SuspenseFallback } from "@/components/primitives/suspense-fallback";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";
import { cn } from "@/lib/utils";
import { AuthProviderService } from "@/server/services/auth-provider-service";
import Link from "next/link";

interface AuthFormProps extends ComponentPropsWithoutRef<"div"> {
	mode: "sign-in" | "sign-up";
	children?: ReactNode;
	title?: string;
	description?: string;
}

export async function AuthForm({
	mode = "sign-in",
	className,
	children,
	title,
	description,
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

	// Fetch auth providers data
	const orderedProviders = await AuthProviderService.getOrderedProviders();
	const filteredProviders = orderedProviders.filter(Boolean) as Array<{
		id: string;
		name: string;
		isExcluded?: boolean;
	}>;

	return (
		<div className={cn("flex flex-col gap-6", className)} {...props}>
			<Card>
				<CardHeader className="text-center">
					<CardTitle className="text-xl">{cardTitle}</CardTitle>
					<CardDescription>{cardDescription}</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="grid gap-6 relative">
						<OAuthButtons
							collapsible
							variant="icons"
							providers={filteredProviders}
						/>

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
			</Card>
			<div className="text-balance text-center text-xs text-muted-foreground [&_a]:underline [&_a]:underline-offset-4 [&_a]:hover:text-primary">
				By clicking continue, you agree to our <Link href={routes.terms}>Terms of Service</Link> and{" "}
				<Link href={routes.privacy}>Privacy Policy</Link>.
			</div>
		</div>
	);
}
