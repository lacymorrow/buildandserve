import { ShipkitProvider } from "@/components/providers/shipkit-provider";
import { TeamProvider } from "@/components/providers/team-provider";
import { ViewTransitions } from "next-view-transitions";
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from "react";
import { PageTracker } from "react-page-tracker";

const DEFAULT_TEAMS = [{ id: "personal", name: "Personal" }]

/**
 * Root layout component that wraps the entire application
 * Uses ShipkitProvider to manage all core providers
 */
export async function AppLayout({ children }: { children: ReactNode }) {

	return (
		<ViewTransitions>
			{/* PageTracker - Track page views */}
			<PageTracker />

			{/* ShipkitProvider - Manage all core providers */}
			<ShipkitProvider>
				<NuqsAdapter>
					<TeamProvider initialTeams={DEFAULT_TEAMS}>
						{children}
					</TeamProvider>
				</NuqsAdapter>
			</ShipkitProvider>
		</ViewTransitions>
	);
}
