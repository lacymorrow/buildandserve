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
import { importPayments } from "@/server/actions/payments";
import type { ImportProvider } from "@/types/payments";
import { Import } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const ImportUsersButton = () => {
	const [isLoading, setIsLoading] = useState<ImportProvider | null>(null);

	const handleImport = async (provider: ImportProvider) => {
		try {
			setIsLoading(provider);

			const result = await importPayments(provider);

			// For successful imports, display a success toast
			// Since we don't have importedUsers and importedPayments in the return type,
			// we'll just show a generic success message
			toast.success(
				"Import successful",
				{
					description: `Successfully imported payments from ${provider === "all" ? "all providers" : provider}`,
				}
			);
		} catch (error) {
			toast.error("Import failed", {
				description: error instanceof Error ? error.message : "An unknown error occurred",
			});
		} finally {
			setIsLoading(null);
		}
	};

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button variant="outline" size="sm">
					<Import className="mr-2 h-4 w-4" />
					Import Users & Payments
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				<DropdownMenuLabel>Select Provider</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					disabled={!!isLoading}
					onClick={() => handleImport("all")}
				>
					{isLoading === "all" ? "Importing..." : "All Providers"}
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={!!isLoading}
					onClick={() => handleImport("lemonsqueezy")}
				>
					{isLoading === "lemonsqueezy" ? "Importing..." : "Lemon Squeezy"}
				</DropdownMenuItem>
				<DropdownMenuItem
					disabled={!!isLoading}
					onClick={() => handleImport("polar")}
				>
					{isLoading === "polar" ? "Importing..." : "Polar"}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
};
