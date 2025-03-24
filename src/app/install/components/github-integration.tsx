"use client";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangleIcon, CheckCircleIcon, GitBranchIcon, GithubIcon } from "lucide-react";
import { useState } from "react";
import type { FileChange } from "./file-change-display";

export const GitHubIntegration = ({
	changedFiles,
	disabled = false,
}: {
	changedFiles: FileChange[];
	disabled?: boolean;
}) => {
	// State for branch and commit information
	const [branchName, setBranchName] = useState(
		`shadcn-${new Date().toISOString().split("T")[0]}`
	);
	const [commitMessage, setCommitMessage] = useState("Add Shadcn UI components");

	// State for pull request information
	const [prTitle, setPrTitle] = useState("Add Shadcn UI components");
	const [prBody, setPrBody] = useState("");

	// State for operation status
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [prUrl, setPrUrl] = useState<string | null>(null);

	// State for UI
	const [activeTab, setActiveTab] = useState("branch");

	const handleSubmit = async () => {
		// Client-side validation
		if (!branchName?.trim()) {
			setError("Branch name is required");
			return;
		}

		if (!commitMessage?.trim()) {
			setError("Commit message is required");
			return;
		}

		if (!prTitle?.trim()) {
			setError("Pull request title is required");
			return;
		}

		if (changedFiles.length === 0) {
			setError("No changes to submit. Please add components first.");
			return;
		}

		// Validate branch name format
		const branchNameRegex = /^[a-zA-Z0-9-_/]+$/;
		if (!branchNameRegex.test(branchName)) {
			setError("Branch name can only contain letters, numbers, hyphens, underscores, and forward slashes");
			return;
		}

		setIsLoading(true);
		setError(null);
		setSuccess(null);
		setPrUrl(null);

		try {
			// Step 1: Create a new branch
			const branchResponse = await fetch("/api/github/create-branch", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					branchName: branchName.trim(),
				}),
			});

			const branchData = await branchResponse.json();

			if (!branchResponse.ok) {
				throw new Error(branchData.details || branchData.error || "Failed to create branch");
			}

			setSuccess(`Branch "${branchName}" created successfully.`);

			// Step 2: Commit changes to the branch
			const commitResponse = await fetch("/api/github/commit-changes", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					branchName: branchName.trim(),
					commitMessage: commitMessage.trim(),
					files: changedFiles.map((file) => ({
						path: file.path,
						content: file.content,
					})),
				}),
			});

			const commitData = await commitResponse.json();

			if (!commitResponse.ok) {
				throw new Error(commitData.details || commitData.error || "Failed to commit changes");
			}

			setSuccess(`Changes committed successfully to branch "${branchName}".`);

			// Step 3: Create a pull request
			// Create a PR body that lists the changed files
			const generatedPrBody =
				prBody ||
				`## Shadcn UI Components Added

${changedFiles.map((file) => `- \`${file.path}\``).join("\n")}

${changedFiles.some((file) => file.path.includes("component"))
					? `\n## Components Added
${changedFiles
						.filter((file) => file.path.includes("component") && file.path.includes(".tsx"))
						.map((file) => {
							const componentName = file.path.split("/").pop()?.replace(".tsx", "");
							return `- ${componentName}`;
						})
						.join("\n")}`
					: ""
				}
`;

			const prResponse = await fetch("/api/github/create-pr", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					branchName: branchName.trim(),
					title: prTitle.trim(),
					body: generatedPrBody.trim(),
				}),
			});

			const prData = await prResponse.json();

			if (!prResponse.ok) {
				throw new Error(prData.details || prData.error || "Failed to create pull request");
			}

			setSuccess(`Pull request created successfully! PR #${prData.pull_number}`);
			setPrUrl(prData.html_url);
		} catch (error) {
			console.error("Error during GitHub operation:", error);

			// Extract the most meaningful error message
			let errorMessage = error instanceof Error ? error.message : "An unexpected error occurred";

			// Add helpful context based on error message
			if (errorMessage.includes("authentication failed")) {
				errorMessage += ". Please check if your GitHub access token is valid and has the required permissions.";
			} else if (errorMessage.includes("permission denied")) {
				errorMessage += ". Please check if you have the necessary permissions to create branches and pull requests.";
			} else if (errorMessage.includes("rate limit")) {
				errorMessage += ". Please try again later.";
			}

			setError(errorMessage);
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<GithubIcon className="h-5 w-5" />
					GitHub Integration
				</CardTitle>
				<CardDescription>
					Create a branch and pull request with your Shadcn UI components
				</CardDescription>
			</CardHeader>
			<CardContent>
				{error && (
					<Alert variant="destructive" className="mb-4">
						<AlertTriangleIcon className="h-4 w-4" />
						<AlertTitle>Error</AlertTitle>
						<AlertDescription>{error}</AlertDescription>
					</Alert>
				)}

				{success && (
					<Alert className="mb-4 border-green-600 text-green-600">
						<CheckCircleIcon className="h-4 w-4" />
						<AlertTitle>Success</AlertTitle>
						<AlertDescription>
							{success}
							{prUrl && (
								<div className="mt-2">
									<a
										href={prUrl}
										target="_blank"
										rel="noopener noreferrer"
										className="text-blue-600 hover:underline"
									>
										View Pull Request →
									</a>
								</div>
							)}
						</AlertDescription>
					</Alert>
				)}

				<Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="branch" className="text-xs">
							<GitBranchIcon className="h-3 w-3 mr-2" />
							Branch & Commit
						</TabsTrigger>
						<TabsTrigger value="pr" className="text-xs">
							<GithubIcon className="h-3 w-3 mr-2" />
							Pull Request
						</TabsTrigger>
					</TabsList>

					<TabsContent value="branch" className="space-y-4 pt-4">
						<div className="space-y-2">
							<label htmlFor="branch-name" className="text-sm font-medium">
								Branch Name
							</label>
							<Input
								id="branch-name"
								value={branchName}
								onChange={(e) => setBranchName(e.target.value)}
								placeholder="feature/shadcn-components"
								disabled={isLoading || disabled}
							/>
						</div>

						<div className="space-y-2">
							<label htmlFor="commit-message" className="text-sm font-medium">
								Commit Message
							</label>
							<Input
								id="commit-message"
								value={commitMessage}
								onChange={(e) => setCommitMessage(e.target.value)}
								placeholder="Add Shadcn UI components"
								disabled={isLoading || disabled}
							/>
						</div>
					</TabsContent>

					<TabsContent value="pr" className="space-y-4 pt-4">
						<div className="space-y-2">
							<label htmlFor="pr-title" className="text-sm font-medium">
								Pull Request Title
							</label>
							<Input
								id="pr-title"
								value={prTitle}
								onChange={(e) => setPrTitle(e.target.value)}
								placeholder="Add Shadcn UI components"
								disabled={isLoading || disabled}
							/>
						</div>

						<div className="space-y-2">
							<label htmlFor="pr-body" className="text-sm font-medium">
								Pull Request Description (Optional)
							</label>
							<Textarea
								id="pr-body"
								value={prBody}
								onChange={(e) => setPrBody(e.target.value)}
								placeholder="Describe the changes made with these components..."
								rows={4}
								disabled={isLoading || disabled}
							/>
							<p className="text-xs text-muted-foreground">
								Leave empty to generate a description automatically based on changed files.
							</p>
						</div>
					</TabsContent>
				</Tabs>

				<div className="mt-6">
					<Button
						onClick={handleSubmit}
						disabled={isLoading || disabled || changedFiles.length === 0}
						className="w-full"
					>
						{isLoading ? (
							<span className="flex items-center">
								<span className="animate-spin mr-2 h-3 w-3 border-2 border-current border-t-transparent rounded-full" />
								Creating Pull Request...
							</span>
						) : (
							<>
								<GithubIcon className="mr-2 h-4 w-4" />
								Submit to GitHub
							</>
						)}
					</Button>

					{changedFiles.length === 0 && (
						<p className="text-xs text-muted-foreground mt-2">
							No changes to submit. Add components first.
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
};
