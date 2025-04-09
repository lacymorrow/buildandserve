export const dynamic = 'force-dynamic';

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { getIntegrationStatuses } from "@/server/services/integration-service";
import {
	Settings,
	XCircle
} from "lucide-react";
import { IntegrationsClientContent } from "./integrations-client-content";

// Define the structure for each integration's status (matching the action)
interface IntegrationStatus {
	name: string;
	enabled: boolean;
	configured: boolean;
	message: string;
	adminUrl?: string;
}

// Type for the categorized data structure
interface CategorizedIntegrationStatuses {
	[category: string]: IntegrationStatus[];
}

// Make the page component async
export default async function IntegrationsPage() {
	let categorizedIntegrations: CategorizedIntegrationStatuses = {};
	let fetchError: string | null = null;

	try {
		const statuses = await getIntegrationStatuses();
		categorizedIntegrations = Object.entries(statuses)
			.filter(([category, integrations]) => integrations.length > 0 || category === "Authorization")
			.reduce((acc, [category, integrations]) => {
				acc[category] = integrations;
				return acc;
			}, {} as CategorizedIntegrationStatuses);
	} catch (err) {
		console.error("Error fetching integration statuses:", err);
		fetchError = err instanceof Error ? err.message : "Failed to load statuses.";
	}

	return (
		<div className="container mx-auto max-w-5xl py-10 space-y-8">
			<div className="flex items-center justify-between">
				<h1 className="text-3xl font-bold tracking-tight">Integrations</h1>
				<Settings className="h-6 w-6 text-muted-foreground" />
			</div>

			{fetchError && (
				<Alert variant="destructive">
					<XCircle className="h-4 w-4" />
					<AlertTitle>Error Loading Integrations</AlertTitle>
					<AlertDescription>{fetchError}</AlertDescription>
				</Alert>
			)}

			{!fetchError && (
				<IntegrationsClientContent categorizedIntegrations={categorizedIntegrations} />
			)}

			{!fetchError && Object.keys(categorizedIntegrations).length === 0 && (
				<p className="text-center text-muted-foreground py-10">
					No integration statuses found or could be loaded.
				</p>
			)}
		</div>
	);
}
