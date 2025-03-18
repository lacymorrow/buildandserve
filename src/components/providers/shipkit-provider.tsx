import { ErrorToast } from "@/components/primitives/error-toast";
import { JsonLd } from "@/components/primitives/json-ld";
import { AnalyticsProvider } from "@/components/providers/analytics-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TRPCReactProvider } from "@/lib/trpc/react";
import HolyLoader from "holy-loader";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Suspense } from "react";

import { getTeamData } from "@/components/providers/team-data";
import { TeamProvider } from "@/components/providers/team-provider";
import '@/styles/globals.css';

interface ShipkitProviderProps {
	children: ReactNode;
	/**
	 * Session data for Next Auth
	 */
	session?: any;
	/**
	 * Page props for TRPC
	 */
	pageProps?: any;
}

/**
 * Main provider component that wraps all providers used in the application
 * Can be used in both App Router and Pages Router
 */
export async function ShipkitProvider({
	children,
	session,
	pageProps,
}: ShipkitProviderProps) {
	const teams = await getTeamData();
	return (
		<>
			<JsonLd organization website />
			<HolyLoader
				showSpinner
				height={"4px"}
				color={"linear-gradient(90deg, #FF61D8, #8C52FF, #5CE1E6, #FF61D8)"}
			/>
			<SessionProvider session={session}>
				<TRPCReactProvider {...pageProps}>
					<ThemeProvider attribute="class" defaultTheme="system">
						<TooltipProvider delayDuration={100}>
							<AnalyticsProvider>
								<TeamProvider initialTeams={teams}>

									{/* Content */}
									{children}

									{/* Toast - Display messages to the user */}
									<Toaster />

									{/* Error Toast - Display error messages to the user based on search params */}
									<Suspense>
										<ErrorToast />
									</Suspense>
								</TeamProvider>
							</AnalyticsProvider>
						</TooltipProvider>
					</ThemeProvider>
				</TRPCReactProvider>
			</SessionProvider>
		</>
	);
}
