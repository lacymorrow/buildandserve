import { Suspense } from "react";

import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/primitives/page-header";
import { DataTable } from "@/components/ui/data-table/data-table";
import { Skeleton } from "@/components/ui/skeleton";

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
	const users = await PaymentService.getUsersWithPayments();

	return (
		<DataTable
			columns={columns}
			data={users}
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
						View and manage all users in your database.
					</PageHeaderDescription>
				</PageHeader>

				{/* Todo: This breaks the page [Table] Column with id 'lemonSqueezyStatus' does not exist. */}
				{/* <ImportPayments /> */}

			</div>
			<Suspense fallback={<UsersTableSkeleton />}>
				<UsersTableContent />
			</Suspense>
		</>
	);
}
