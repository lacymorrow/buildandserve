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
import type { PaymentProvider } from "@/server/actions/payments";
import { importPayments } from "@/server/actions/payments";
import { Import } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export const ImportUsersButton = () => {
	const [isLoading, setIsLoading] = useState<PaymentProvider | null>(null);

	const handleImport = async (provider: PaymentProvider) => {
		try {
			setIsLoading(provider);

			const result = await importPayments(provider);

			if (result.success) {
				const userSuffix = result.importedUsers !== 1 ? "s" : "";
				const paymentSuffix = result.importedPayments !== 1 ? "s" : "";

				toast.success(
					"Import successful",
					{
						description: `Imported ${result.importedUsers} user${userSuffix} and ${result.importedPayments} payment${paymentSuffix} from ${provider === "all" ? "all providers" : provider}`,
					}
				);
			} else {
				toast.error("Import failed", {
					description: result.error || "An unknown error occurred",
				});
			}
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
