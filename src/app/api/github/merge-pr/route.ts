import { env } from "@/env";
import { Octokit } from "@octokit/rest";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
	try {
		const { pull_number, merge_method = "merge" } = await req.json();

		if (!pull_number) {
			return NextResponse.json({ error: "Pull request number is required" }, { status: 400 });
		}

		const octokit = new Octokit({
			auth: env.GITHUB_ACCESS_TOKEN,
		});

		// Merge the pull request
		const { data } = await octokit.pulls.merge({
			owner: env.GITHUB_REPO_OWNER ?? "",
			repo: env.GITHUB_REPO_NAME ?? "",
			pull_number,
			merge_method: merge_method as "merge" | "squash" | "rebase",
		});

		return NextResponse.json({
			message: "Pull request merged successfully",
			merged: data.merged,
			sha: data.sha,
		});
	} catch (error) {
		console.error("Error merging PR:", error);
		return NextResponse.json(
			{
				error: "Failed to merge pull request",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}
