import { Link } from "@/components/primitives/link-with-transition";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import {
	CheckCircle,
	ExternalLink,
	Settings,
	XCircle,
} from "lucide-react";
import React from "react";
import { getIntegrationStatuses } from "@/server/services/integration-service";

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

// Integration Card component can remain a simple function
const renderIntegrationCard = (status: IntegrationStatus) => (
	<Card key={status.name} className="flex flex-col">
		<CardHeader>
			<CardTitle className="flex items-center justify-between">
				{status.name}
				<Badge variant={status.enabled ? "default" : "destructive"}>
					{status.enabled ? "Enabled" : "Disabled"}
				</Badge>
			</CardTitle>
			<CardDescription>Configuration Status</CardDescription>
		</CardHeader>
		<CardContent className="flex-grow flex flex-col justify-between">
			<div className="mb-4 flex items-start space-x-2 text-sm">
				{status.configured ? (
					<CheckCircle className="h-4 w-4 mt-0.5 text-green-600 flex-shrink-0" />
				) : (
					<XCircle className="h-4 w-4 mt-0.5 text-red-600 flex-shrink-0" />
				)}
				<p className="text-muted-foreground">{status.message}</p>
			</div>
			{status.adminUrl && (
				<Link
					href={status.adminUrl}
					target="_blank"
					rel="noopener noreferrer"
					className={cn(
						buttonVariants({ variant: "outline", size: "sm" }),
						"mt-auto w-full"
					)}
				>
					Open Admin
					<ExternalLink className="ml-2 h-4 w-4" />
				</Link>
			)}
		</CardContent>
	</Card>
);

// Make the page component async
export default async function IntegrationsPage() {
	let categorizedIntegrations: CategorizedIntegrationStatuses = {};
	let fetchError: string | null = null;

	try {
		const statuses = await getIntegrationStatuses();
		// Filter out categories with no integrations (except Authorization if present)
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

			{!fetchError && Object.keys(categorizedIntegrations).length > 0 && (
				<div className="space-y-10">
					{Object.entries(categorizedIntegrations).map(
						([category, integrations]) =>
							// Skip rendering if a category somehow ended up empty after filtering
							integrations.length > 0 && (
								<section key={category}>
									<h2 className="text-xl font-semibold tracking-tight mb-4">
										{category}
									</h2>
									<div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
										{integrations.map(renderIntegrationCard)}
									</div>
									<Separator className="my-8" />
								</section>
							)
					)}
				</div>
			)}

			{!fetchError && Object.keys(categorizedIntegrations).length === 0 && (
				<p className="text-center text-muted-foreground py-10">
					No integration statuses found or could be loaded.
				</p>
			)}
		</div>
	);
}
