import { Suspense } from "react";

import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/primitives/page-header";
import { DataTable } from "@/components/ui/data-table/data-table";
import { Skeleton } from "@/components/ui/skeleton";

import { ImportPayments } from "@/app/(app)/(admin)/admin/payments/_components/import-payments";
import { PaymentService } from "@/server/services/payment-service";
import { columns } from "./_components/columns";

function UsersTableSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-10 w-[250px]" />
			<div className="rounded-md border">
				<div className="h-24 rounded-md" />
			</div>
		</div>
	);
}

async function UsersTableContent() {
	// Fetch all users with their complete payment history
	const users = await PaymentService.getUsersWithPayments();

	// Make sure purchases are sorted by date (newest first)
	const sortedUsers = users.map(user => ({
		...user,
		purchases: user.purchases?.sort(
			(a, b) => b.purchaseDate.getTime() - a.purchaseDate.getTime()
		) || []
	}));

	return (
		<DataTable
			columns={columns}
			data={sortedUsers}
			searchPlaceholder="Search users..."
		/>
	);
}

/**
 * Admin page component that displays a data table of users and their payment status
 */
export default function AdminPage() {
	return (
		<>
			<div className="flex justify-between items-center mb-6">

				<PageHeader>
					<PageHeaderHeading>User Management</PageHeaderHeading>
					<PageHeaderDescription>
						View and manage all users in your database. Click on a user to see detailed purchase history.
					</PageHeaderDescription>
				</PageHeader>

				<ImportPayments />

			</div>
			<Suspense fallback={<UsersTableSkeleton />}>
				<UsersTableContent />
			</Suspense>
		</>
	);
}
