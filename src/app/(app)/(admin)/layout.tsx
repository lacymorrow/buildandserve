import { Header } from "@/components/headers/header";
import { routes } from "@/config/routes";
import { auth } from "@/server/auth";
import { isAdmin } from "@/server/services/admin-service";
import { redirect } from "next/navigation";
import type React from "react";

const navLinks = [
	// { href: routes.admin.cms, label: "Setup" },
	{ href: routes.admin.cms, label: "CMS" },
	{ href: routes.admin.users, label: "Users" },
	{ href: routes.admin.github, label: "GitHub" },
	{ href: routes.admin.feedback, label: "Feedback" },
	{ href: routes.admin.payments, label: "Payments" },
	{ href: routes.admin.ai, label: "AI" },
];


export default async function AdminLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	const userIsAdmin = isAdmin(session?.user?.email);

	if (!userIsAdmin) {
		console.warn("User is not an admin, redirecting to home", session?.user?.email);
		redirect(routes.home);
	}

	return (
		<div className="flex min-h-screen flex-col">
			<Header
				navLinks={navLinks}
				variant="sticky"
			/>
			<div className="container flex-1 py-6 md:py-10">{children}</div>
		</div>
	);
}
