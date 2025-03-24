import { env } from "@/env";
import { Octokit } from "@octokit/rest";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
	try {
		const { branchName, baseBranch = "main" } = await req.json();

		if (!branchName) {
			return NextResponse.json({ error: "Branch name is required" }, { status: 400 });
		}

		const octokit = new Octokit({
			auth: env.GITHUB_ACCESS_TOKEN,
		});

		// Get the latest commit SHA from the base branch
		const { data: refData } = await octokit.git.getRef({
			owner: env.GITHUB_REPO_OWNER ?? "",
			repo: env.GITHUB_REPO_NAME ?? "",
			ref: `heads/${baseBranch}`,
		});

		const baseSha = refData.object.sha;

		try {
			// Check if branch already exists
			await octokit.git.getRef({
				owner: env.GITHUB_REPO_OWNER ?? "",
				repo: env.GITHUB_REPO_NAME ?? "",
				ref: `heads/${branchName}`,
			});

			// If the above doesn't throw, the branch exists
			return NextResponse.json({ message: `Branch ${branchName} already exists` }, { status: 200 });
		} catch (error) {
			// Branch doesn't exist, so create it
			const { data } = await octokit.git.createRef({
				owner: env.GITHUB_REPO_OWNER ?? "",
				repo: env.GITHUB_REPO_NAME ?? "",
				ref: `refs/heads/${branchName}`,
				sha: baseSha,
			});

			return NextResponse.json({
				message: `Branch ${branchName} created successfully`,
				sha: data.object.sha,
			});
		}
	} catch (error) {
		console.error("Error creating branch:", error);
		return NextResponse.json(
			{
				error: "Failed to create branch",
				details: error instanceof Error ? error.message : String(error),
			},
			{ status: 500 }
		);
	}
}
