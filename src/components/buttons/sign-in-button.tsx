"use client";

import { Link } from "@/components/primitives/link-with-transition";
import { Button } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { SEARCH_PARAM_KEYS } from "@/config/search-param-keys";
import { cn } from "@/lib/utils";
import { usePathname } from "next/navigation";
import type React from "react";

export const SignInButton = ({
	className,
	children = "Login",
	size = "default",
	variant = "default"
}: {
	className?: string;
	children?: React.ReactNode;
	size?: "default" | "sm" | "lg" | "icon";
	variant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";
}) => {
	const pathname = usePathname();

	return (
		<Link
			href={`${routes.auth.signIn}?${SEARCH_PARAM_KEYS.nextUrl}=${pathname}`}
			className={cn("hover:text-foreground", className)}
		>
			<Button size={size} variant={variant}>
				{children}
			</Button>
		</Link>
	);
};

export { SignInButton as LoginButton };
