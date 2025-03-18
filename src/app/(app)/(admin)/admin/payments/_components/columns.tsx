"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PaymentData } from "@/server/services/payment-service";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";
import { ArrowUpDown } from "lucide-react";

export const columns: ColumnDef<PaymentData>[] = [
	{
		accessorKey: "orderId",
		header: "Order ID",
	},
	{
		accessorKey: "userEmail",
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				Customer Email
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
	},
	{
		accessorKey: "userName",
		header: "Customer Name",
		cell: ({ row }) => row.getValue("userName") ?? "N/A",
	},
	{
		accessorKey: "productName",
		header: "Product",
	},
	{
		accessorKey: "processor",
		header: "Payment Processor",
		cell: ({ row }) => {
			const processor: string = row.getValue("processor");
			return <Badge variant="outline">{processor ?? "Unknown"}</Badge>;
		},
	},
	{
		accessorKey: "amount",
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				Amount
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
		cell: ({ row }) => {
			const amount = Number.parseFloat(row.getValue("amount"));
			const formatted = new Intl.NumberFormat("en-US", {
				style: "currency",
				currency: "USD",
			}).format(amount);

			return formatted;
		},
	},
	{
		accessorKey: "status",
		header: "Status",
		cell: ({ row }) => {
			const status: string = row.getValue("status");
			return (
				<Badge
					variant={
						status === "paid" ? "default" : status === "refunded" ? "destructive" : "secondary"
					}
				>
					{status.charAt(0).toUpperCase() + status.slice(1)}
				</Badge>
			);
		},
	},
	{
		accessorKey: "purchaseDate",
		header: ({ column }) => (
			<Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}>
				Purchase Date
				<ArrowUpDown className="ml-2 h-4 w-4" />
			</Button>
		),
		cell: ({ row }) => format(row.getValue("purchaseDate"), "PPP"),
	},
];
