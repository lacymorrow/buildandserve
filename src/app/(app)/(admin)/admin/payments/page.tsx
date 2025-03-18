import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/primitives/page-header";
import { DataTable } from "@/components/ui/data-table/data-table";
import { PaymentService } from "@/server/services/payment-service";
import { columns } from "./_components/columns";
import { ImportPayments } from "./_components/import-payments";

/**
 * Admin payments page component that displays a data table of all payments
 */
export default async function PaymentsPage() {
	// Get payments from the payment service (which handles all payment processors)

	const payments = await PaymentService.getPaymentsWithUsers();

	return (
		<>
			<div className="flex justify-between items-center mb-6">
				<PageHeader>
					<PageHeaderHeading>Payment Management</PageHeaderHeading>
					<PageHeaderDescription>
						View and manage all payments from Lemon Squeezy and Polar.
					</PageHeaderDescription>
				</PageHeader>
				<ImportPayments />
			</div>
			<DataTable
				columns={columns}
				data={payments}
				searchPlaceholder="Search payments..."
			/>
		</>
	);

}
