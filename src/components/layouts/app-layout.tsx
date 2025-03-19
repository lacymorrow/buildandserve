import { ShipkitProvider } from "@/components/providers/shipkit-provider";
import { getTeamData } from "@/components/providers/team-data";
import { TeamProvider } from "@/components/providers/team-provider";
import { logger } from "@/lib/logger";
import { ViewTransitions } from "next-view-transitions";
import Head from "next/head";
import { NuqsAdapter } from 'nuqs/adapters/next/app';
import type { ReactNode } from "react";
import { PageTracker } from "react-page-tracker";

/**
 * Root layout component that wraps the entire application
 * Uses ShipkitProvider to manage all core providers
 */
export async function AppLayout({ children }: { children: ReactNode }) {
	const teams = await getTeamData().catch((error) => {
		logger.warn("Error getting team data", {
			error: error instanceof Error ? error.message : String(error),
		});
		return [];
	});

	return (
		<ViewTransitions>

			<Head>
				{/* React Scan */}
				<script src="https://unpkg.com/react-scan/dist/auto.global.js" async />
			</Head>

			{/* PageTracker - Track page views */}
			<PageTracker />

			{/* ShipkitProvider - Manage all core providers */}
			<ShipkitProvider>
				<NuqsAdapter>
					<TeamProvider initialTeams={teams}>
						{children}
					</TeamProvider>
				</NuqsAdapter>
			</ShipkitProvider>
		</ViewTransitions>
	);
}
