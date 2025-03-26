"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { GithubIcon } from "lucide-react";
import { useState } from "react";
import type { FileChange } from "./file-change-display";

interface GitHubIntegrationProps {
	files: FileChange[];
}

export function GitHubIntegration({ files }: GitHubIntegrationProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState(false);

	const createGitHubPullRequest = async () => {
		setIsLoading(true);
		setError(null);
		setSuccess(false);

		// Simulate GitHub API integration
		try {
			// This would normally make API calls to GitHub
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Simulate success
			setSuccess(true);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to create GitHub PR");
		} finally {
			setIsLoading(false);
		}
	};

	if (files.length === 0) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center">
					<GithubIcon className="mr-2 h-5 w-5" />
					GitHub Integration
				</CardTitle>
				<CardDescription>
					Push these changes directly to your GitHub repository
				</CardDescription>
			</CardHeader>
			<CardContent>
				<p className="text-sm text-muted-foreground mb-4">
					{files.length} file{files.length !== 1 ? "s" : ""} will be committed to your repository.
					This creates a new branch and pull request with your changes.
				</p>
				{error && (
					<div className="bg-destructive/10 text-destructive text-sm p-3 rounded-md mb-4">
						{error}
					</div>
				)}
				{success && (
					<div className="bg-emerald-500/10 text-emerald-500 text-sm p-3 rounded-md mb-4">
						Pull request created successfully! Check your GitHub repository.
					</div>
				)}
			</CardContent>
			<CardFooter>
				<Button
					onClick={createGitHubPullRequest}
					disabled={isLoading || success}
					className="w-full"
				>
					{isLoading ? "Creating PR..." : success ? "PR Created" : "Create GitHub PR"}
				</Button>
			</CardFooter>
		</Card>
	);
}
