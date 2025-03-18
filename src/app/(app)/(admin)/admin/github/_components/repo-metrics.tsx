import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { siteConfig } from "@/config/site";
import { octokit } from "@/server/services/github/github-service";
import { Clock, GitCommit, GitMerge, GitPullRequest } from "lucide-react";

// Metric card titles for skeleton loading state
const skeletonTitles = ["pull-requests", "commits", "branches", "activity"];

export function RepoMetricsSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {skeletonTitles.map((title) => (
        <Card key={title}>
          <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
            <CardTitle className="text-sm font-medium">
              <Skeleton className="h-4 w-[120px]" />
            </CardTitle>
            <Skeleton className="h-4 w-4 rounded-full" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-7 w-[80px]" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

interface RepoMetric {
  id: string;
  title: string;
  value: string | number;
  icon: React.ReactNode;
  description?: string;
}

export async function RepoMetricsContent() {
  const repoOwner = siteConfig.repo.owner;
  const repoName = siteConfig.repo.name;

  try {
    // Get pull requests count
    const { data: pullRequests } = await octokit.rest.pulls.list({
      owner: repoOwner,
      repo: repoName,
      state: "all",
      per_page: 1
    });

    const prCount = pullRequests[0]?.number || 0;

    // Get recent commits
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner: repoOwner,
      repo: repoName,
      per_page: 30
    });

    // Get branches
    const { data: branches } = await octokit.rest.repos.listBranches({
      owner: repoOwner,
      repo: repoName,
      per_page: 100
    });

    // Calculate last activity (in days)
    const lastCommitDate = commits[0]?.commit?.author?.date ?
      new Date(commits[0].commit.author.date) : new Date();
    const daysSinceLastCommit = Math.floor(
      (new Date().getTime() - lastCommitDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    const metrics: RepoMetric[] = [
      {
        id: "pull-requests",
        title: "Pull Requests",
        value: prCount,
        icon: <GitPullRequest className="h-4 w-4 text-blue-500" />,
        description: "Total pull requests"
      },
      {
        id: "recent-commits",
        title: "Recent Commits",
        value: commits.length,
        icon: <GitCommit className="h-4 w-4 text-green-500" />,
        description: "Last 30 commits"
      },
      {
        id: "branches",
        title: "Branches",
        value: branches.length,
        icon: <GitMerge className="h-4 w-4 text-purple-500" />,
        description: "Active branches"
      },
      {
        id: "last-activity",
        title: "Last Activity",
        value: daysSinceLastCommit === 0 ? "Today" : `${daysSinceLastCommit} days ago`,
        icon: <Clock className="h-4 w-4 text-amber-500" />,
        description: "Since last commit"
      }
    ];

    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.id}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium">{metric.title}</CardTitle>
              {metric.icon}
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metric.value}</div>
              {metric.description && (
                <p className="text-xs text-muted-foreground mt-1">{metric.description}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  } catch (error) {
    console.error("Error fetching repo metrics:", error);
    return (
      <Card>
        <CardContent className="py-4">
          <p className="text-sm text-muted-foreground">
            Unable to load repository metrics. Please check your GitHub API token.
          </p>
        </CardContent>
      </Card>
    );
  }
}

export default async function RepoMetrics() {
  return <RepoMetricsContent />;
}
