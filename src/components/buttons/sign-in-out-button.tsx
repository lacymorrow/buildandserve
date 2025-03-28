"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { routes } from "@/config/routes";
import { cn } from "@/lib/utils";
import { signOutAction } from "@/server/actions/auth";
import { useSession } from "next-auth/react";
import Link from "next/link";

const className = "text-inherit";

export async function SignInOutButton() {
	const { data: session } = useSession();

	if (!session?.user) {
		return (
			<Link
				className={cn(buttonVariants({ variant: "link" }), className)}
				href={routes.auth.signIn}
			>
				Login
			</Link>
		);
	}

	return (
		<form action={signOutAction}>
			<Button type="submit" variant="link" className={className}>
				Logout
			</Button>
		</form>
	);
}

export { SignInOutButton as LoginOutButton };
