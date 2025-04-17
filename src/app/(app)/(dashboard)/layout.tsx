import { DashboardLayout } from "@/components/layouts/dashboard-layout";
import { routes } from "@/config/routes";
import { SEARCH_PARAM_KEYS } from "@/config/search-param-keys";
import { auth } from "@/server/auth";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

export default async function Layout({
	children,
}: {
	children: ReactNode;
}) {
	const session = await auth();

	if (!session?.user) {
		// "Redirect to sign in" so they will be directed back after.
		const url = new URL(routes.auth.signIn);
		url.searchParams.set(SEARCH_PARAM_KEYS.nextUrl, routes.app.dashboard);
		redirect(url.toString());
	}
	return <DashboardLayout>{children}</DashboardLayout>;
}
