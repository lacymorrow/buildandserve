import { PageHeader, PageHeaderDescription, PageHeaderHeading } from "@/components/primitives/page-header";
import { DataTable } from "@/components/ui/data-table/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { db } from "@/server/db";
import { getCollaboratorDetails } from "@/server/services/github/github-service";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { columns } from "./_components/columns";
import RepoInfo, { RepoInfoSkeleton } from "./_components/repo-info";
import RepoMetrics, { RepoMetricsSkeleton } from "./_components/repo-metrics";

function GitHubUsersTableSkeleton() {
	return (
		<div className="space-y-4">
			<Skeleton className="h-10 w-[250px]" />
			<div className="rounded-md border">
				<div className="h-24 rounded-md" />
			</div>
		</div>
	);
}

async function GitHubUsersTableContent() {
	if (!db) notFound();

	// Fetch users with GitHub usernames
	const githubUsers = await db.query.users.findMany({
		where: (users, { isNotNull }) => isNotNull(users.githubUsername),
		columns: {
			id: true,
			email: true,
			name: true,
			githubUsername: true,
			createdAt: true,
			updatedAt: true,
		},
	});

	// Fetch GitHub details for each user
	const usersWithDetails = await Promise.all(
		githubUsers.map(async (user) => {
			if (!user.githubUsername) return user;
			const details = await getCollaboratorDetails(user.githubUsername);
			return {
				...user,
				githubDetails: details,
			};
		}),
	);

	return (
		<DataTable
			columns={columns}
			data={usersWithDetails}
			searchPlaceholder="Search GitHub users..."
		/>
	);
}

export default function GitHubUsersPage() {
	return (
		<div className="container mx-auto py-10">
			<PageHeader>
				<PageHeaderHeading>GitHub Integration</PageHeaderHeading>
				<PageHeaderDescription>
					Manage GitHub repository access and view connected users.
				</PageHeaderDescription>
			</PageHeader>

			{/* Repository Information Card */}
			<div className="mb-8">
				<Suspense fallback={<RepoInfoSkeleton />}>
					<RepoInfo />
				</Suspense>
			</div>

			{/* Repository Metrics */}
			<div className="mb-10">
				<h2 className="text-xl font-semibold tracking-tight mb-4">Repository Metrics</h2>
				<Suspense fallback={<RepoMetricsSkeleton />}>
					<RepoMetrics />
				</Suspense>
			</div>

			{/* GitHub Users Section */}
			<div className="mb-6">
				<h2 className="text-xl font-semibold tracking-tight">Repository Collaborators</h2>
				<p className="text-sm text-muted-foreground">
					Users with access to the GitHub repository.
				</p>
			</div>

			<Suspense fallback={<GitHubUsersTableSkeleton />}>
				<GitHubUsersTableContent />
			</Suspense>
		</div>
	);
}
