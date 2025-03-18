"use client";

import { GitHubConnectButton } from "@/components/buttons/github-connect-button";
import { VercelConnectButton } from "@/components/shipkit/vercel-connect-button";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { routes } from "@/config/routes";
import { deleteAccount, disconnectAccount } from "@/server/actions/settings";
import { signOut, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function AccountPage() {
	const { data: session, update: updateSession } = useSession();
	const [isPending, startTransition] = React.useTransition();
	const [isOpen, setIsOpen] = React.useState(false);
	const [isDisconnecting, setIsDisconnecting] = React.useState(false);
	const searchParams = useSearchParams();
	const router = useRouter();

	const connectedAccounts = [
		{
			name: "GitHub",
			connected: !!session?.user?.githubUsername,
			username: session?.user?.githubUsername,
		},
		{
			name: "GitLab",
			connected: false,
			username: null,
		},
		{
			name: "Bitbucket",
			connected: false,
			username: null,
		},
		// Add more providers here as they become available
	];

	// Use state to track if we've already processed the URL parameters
	// This ensures the state persists across re-renders
	const [hasProcessedParams, setHasProcessedParams] = useState(false);

	// Check if user has connected Vercel
	const hasVercelConnection = session?.user?.accounts?.some(account => account.provider === "vercel");

	// Handle URL parameters for OAuth callback
	useEffect(() => {
		// Skip if we've already processed the parameters or if there are no parameters
		if (!searchParams || hasProcessedParams) return;

		const success = searchParams.get("success");
		const error = searchParams.get("error");

		// Only process if we have relevant parameters
		if (!success && !error) return;

		if (success === "vercel_connected") {
			toast.success("Successfully connected to Vercel");
			// Force a full session update to ensure the UI reflects the Vercel connection
			updateSession({ force: true });
		}

		if (error) {
			let errorMessage = "Failed to connect to Vercel";

			switch (error) {
				case "vercel_auth_error":
					errorMessage = "Vercel authentication error";
					break;
				case "no_code":
					errorMessage = "No authorization code provided";
					break;
				case "token_exchange_failed":
					errorMessage = "Failed to exchange code for token";
					break;
				case "user_info_failed":
					errorMessage = "Failed to get user info from Vercel";
					break;
				case "no_user_id":
					errorMessage = "Failed to get Vercel user ID";
					break;
				case "internal_error":
					errorMessage = "An internal error occurred";
					break;
			}

			toast.error(errorMessage);
		}

		// Remove the parameters from the URL to prevent re-processing
		router.replace(routes.settings.account);

		// Mark that we've processed the URL parameters
		setHasProcessedParams(true);
	}, [searchParams, updateSession, router, hasProcessedParams]);

	function handleDeleteAccount() {
		if (isPending) return;

		startTransition(async () => {
			try {
				const result = await deleteAccount();

				if (!result.success) {
					toast.error(result.error ?? "Failed to delete account");
					return;
				}

				toast.success(result.message);

				// Sign out and redirect to home page
				await signOut({ callbackUrl: routes.home });
			} catch (error) {
				console.error("Delete account error:", error);
				toast.error("An unexpected error occurred");
			} finally {
				setIsOpen(false);
			}
		});
	}

	const handleDisconnectVercel = async () => {
		if (isDisconnecting) return;

		setIsDisconnecting(true);
		try {
			const result = await disconnectAccount("vercel");

			if (!result.success) {
				toast.error(result.error ?? "Failed to disconnect Vercel account");
				return;
			}

			toast.success(result.message);

			// Force a full session update to ensure the UI reflects the change
			await updateSession({ force: true });
		} catch (error) {
			console.error("Disconnect Vercel error:", error);
			toast.error("An unexpected error occurred");
		} finally {
			setIsDisconnecting(false);
		}
	};

	return (
		<div className="space-y-6">
			<div>
				<h3 className="text-lg font-medium">Account</h3>
				<p className="text-sm text-muted-foreground">
					Manage your account settings.
				</p>
				{/* Debug button for manual session refresh */}
				<div className="mt-2">
					<Button
						variant="outline"
						size="sm"
						onClick={() => updateSession({ force: true })}
						className="text-xs"
					>
						Refresh Session Data
					</Button>
				</div>
			</div>
			<Separator />

			{/* Vercel Connection */}
			<Card>
				<CardHeader>
					<CardTitle>Vercel Connection</CardTitle>
					<CardDescription>
						Connect your Vercel account to deploy projects directly.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<div className="space-y-2">
						<p>
							{hasVercelConnection
								? "Your Vercel account is connected. You can now deploy projects directly to Vercel."
								: "Connect your Vercel account to deploy projects directly from Shipkit."}
						</p>
						{hasVercelConnection && (
							<div className="flex items-center space-x-2 text-sm text-green-600 dark:text-green-500">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									width="16"
									height="16"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M20 6 9 17l-5-5" />
								</svg>
								<span>
									Connected to Vercel
									{session?.user?.accounts?.find(a => a.provider === "vercel")?.providerAccountId &&
										` (${session.user.accounts.find(a => a.provider === "vercel")?.providerAccountId.substring(0, 8)}...)`}
								</span>
							</div>
						)}
					</div>
				</CardContent>
				<CardFooter>
					{hasVercelConnection ? (
						<Button
							variant="outline"
							onClick={handleDisconnectVercel}
							disabled={isDisconnecting}
						>
							{isDisconnecting ? "Disconnecting..." : "Disconnect Vercel"}
						</Button>
					) : (
						<VercelConnectButton />
					)}
				</CardFooter>
			</Card>


			<Card>
				<CardHeader>
					<CardTitle>GitHub Connection</CardTitle>
					<CardDescription>
						Connect your GitHub account to access the repository.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<GitHubConnectButton />
				</CardContent>
			</Card>

			{/* Connected Accounts */}
			<Card>
				<CardHeader>
					<CardTitle>Connected Accounts</CardTitle>
					<CardDescription>
						Manage your connected accounts and authentication methods.
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{connectedAccounts.map((account) => (
						<div
							key={account.name}
							className="flex items-center justify-between space-x-4"
						>
							<div className="flex flex-col space-y-1">
								<span className="font-medium">{account.name}</span>
								{account.connected ? (
									<span className="text-sm text-muted-foreground">
										Connected as {account.username}
									</span>
								) : (
									<span className="text-sm text-muted-foreground">
										Not connected
									</span>
								)}
							</div>
							<Button
								variant={account.connected ? "outline" : "default"}
								onClick={() =>
									toast.info(
										`${account.name} connection management will be available in a future update`,
									)
								}
							>
								{account.connected ? "Disconnect" : "Connect"}
							</Button>
						</div>
					))}
				</CardContent>
			</Card>

			{/* Delete Account */}
			<Card>
				<CardHeader>
					<CardTitle>Delete Account</CardTitle>
					<CardDescription>
						Permanently delete your account and all associated data.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<p className="text-sm text-muted-foreground">
						This action cannot be undone. All your data will be permanently
						deleted.
					</p>
				</CardContent>
				<CardFooter>
					<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
						<AlertDialogTrigger asChild>
							<Button variant="destructive">Delete Account</Button>
						</AlertDialogTrigger>
						<AlertDialogContent>
							<AlertDialogHeader>
								<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
								<AlertDialogDescription>
									This action cannot be undone. This will permanently delete
									your account and remove all associated data from our servers.
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel disabled={isPending}>
									Cancel
								</AlertDialogCancel>
								<AlertDialogAction
									onClick={handleDeleteAccount}
									disabled={isPending}
									className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
								>
									{isPending ? "Deleting..." : "Delete Account"}
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				</CardFooter>
			</Card>
		</div>
	);
}
