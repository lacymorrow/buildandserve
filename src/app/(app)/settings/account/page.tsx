"use client";

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
import { VercelConnectButton } from "@/components/ui/vercel-connect-button";
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
			updateSession();
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
		router.replace("/settings/account");

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
				await signOut({ callbackUrl: "/" });
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

			// Update the session to reflect the change
			await updateSession();
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
					<p className="">
						{hasVercelConnection
							? "Your Vercel account is connected. You can now deploy projects directly to Vercel."
							: "Connect your Vercel account to deploy projects directly from Shipkit."}
					</p>
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
