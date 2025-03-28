"use client";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { importPayments } from "@/server/actions/payments";
import { FolderSyncIcon, Loader2 } from "lucide-react";
import { useState } from "react";

/**
 * Component to import payments from payment providers
 */
export function ImportPayments() {
	const { toast } = useToast();
	const [isLoading, setIsLoading] = useState(false);
	const [provider, setProvider] = useState<string | null>(null);

	/**
	 * Imports payments from a specific provider
	 * @param provider - The payment provider to import from
	 */
	const handleImport = async (provider: "lemonsqueezy" | "polar" | "all") => {
		try {
			setIsLoading(true);
			setProvider(provider);

			const result = await importPayments(provider);

			// Format the result message based on the provider
			let message = "";
			if (provider === "all") {
				// Cast result to the correct type for "all" provider
				const allResult = result as {
					lemonsqueezy: { total: number; imported: number; skipped: number; errors: number; usersCreated: number };
					polar: { total: number; imported: number; skipped: number; errors: number; usersCreated: number };
				};

				message = `
                    Lemon Squeezy: ${allResult.lemonsqueezy.imported} imported,
                    ${allResult.lemonsqueezy.skipped} skipped,
                    ${allResult.lemonsqueezy.errors} errors,
                    ${allResult.lemonsqueezy.usersCreated} users created.
                    Polar: ${allResult.polar.imported} imported,
                    ${allResult.polar.skipped} skipped,
                    ${allResult.polar.errors} errors,
                    ${allResult.polar.usersCreated} users created.
                `;
			} else {
				// Cast result to the correct type for single provider
				const singleResult = result as {
					total: number;
					imported: number;
					skipped: number;
					errors: number;
					usersCreated: number;
				};

				message = `${singleResult.imported} imported, ${singleResult.skipped} skipped, ${singleResult.errors} errors, ${singleResult.usersCreated} users created.`;
			}

			toast({
				title: `${provider === "all" ? "All payments" : provider} import complete`,
				description: message,
				variant: "default",
			});
		} catch (error) {
			console.error("Error importing payments", error);
			toast({
				title: "Import failed",
				description: error instanceof Error ? error.message : "Unknown error",
				variant: "destructive",
			});
		} finally {
			setIsLoading(false);
			setProvider(null);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm" disabled={isLoading}>
					{isLoading ? (
						<>
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
							Importing {provider}...
						</>
					) : (
						<>
							<FolderSyncIcon className="mr-2 h-4 w-4" />
							Sync Users and Payments
						</>
					)}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>Select Provider</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => handleImport("lemonsqueezy")}
					disabled={isLoading}
				>
					Lemon Squeezy
				</DropdownMenuItem>
				<DropdownMenuItem
					onClick={() => handleImport("polar")}
					disabled={isLoading}
				>
					Polar
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onClick={() => handleImport("all")}
					disabled={isLoading}
				>
					All Providers
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
