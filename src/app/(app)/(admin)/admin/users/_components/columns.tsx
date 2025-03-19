"use client";

import { Badge } from "@/components/ui/badge";
import type { UserData } from "@/server/services/payment-service";
import type { ColumnDef } from "@tanstack/react-table";
import { format } from "date-fns";

const formatDate = (date: Date | null) => {
	return date ? format(date, "MMM d, yyyy") : "N/A";
};

export const columns: ColumnDef<UserData>[] = [
	{
		accessorKey: "email",
		header: "Email",
		cell: ({ row }) => row.original?.email ?? "N/A",
	},
	{
		accessorKey: "name",
		header: "Name",
		cell: ({ row }) => row.original?.name ?? "N/A",
	},
	{
		accessorKey: "createdAt",
		header: "Joined",
		cell: ({ row }) => formatDate(row.original?.createdAt ?? null),
	},
	{
		accessorKey: "hasPaid",
		header: "Payment Status",
		cell: ({ row }) => {
			const hasPaid = Boolean(row.getValue("hasPaid"));

			return (
				<div className="flex flex-col gap-1 items-start justify-center">
					<Badge variant={hasPaid ? "default" : "secondary"}>{hasPaid ? "Paid" : "Not Paid"}</Badge>
				</div>
			);
		},
	},
	{
		accessorKey: "hasActiveSubscription",
		header: "Subscription",
		cell: ({ row }) => {
			const hasActiveSubscription = Boolean(row.getValue("hasActiveSubscription"));

			return (
				<div className="flex flex-col gap-1 items-start justify-center">
					<Badge variant={hasActiveSubscription ? "default" : "outline"}>{hasActiveSubscription ? "Active" : "None"}</Badge>
				</div>
			);
		},
	},
	{
		accessorKey: "lastPurchaseDate",
		header: "Last Purchase",
		cell: ({ row }) => formatDate(row.original?.lastPurchaseDate ?? null),
	},
	{
		accessorKey: "totalPurchases",
		header: "Total Purchases",
		cell: ({ row }) => row.original?.totalPurchases ?? 0,
	},
];
