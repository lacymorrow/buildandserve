"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import crypto from "crypto";
import { useState } from "react";

export const VercelConnectButton = () => {
	const [isLoading, setIsLoading] = useState(false);
	const { toast } = useToast();

	if (!process.env.NEXT_PUBLIC_VERCEL_INTEGRATION_SLUG) {
		return null;
	}

	const handleConnect = async () => {
		try {
			setIsLoading(true);

			// the integration URL slug from vercel
			const client_slug = process.env.NEXT_PUBLIC_VERCEL_INTEGRATION_SLUG;

			// create a CSRF token and store it locally
			const state = crypto.randomBytes(16).toString("hex");
			localStorage.setItem("latestCSRFToken", state);

			// Get the origin for the callback URL
			const origin = window.location.origin;

			// Create the redirect URI
			const redirectUri = `${origin}/connect/vercel/auth`;

			// redirect the user to vercel with the callback URL
			// Use redirectUri as the parameter name for consistency with the OAuth spec
			const link = `https://vercel.com/integrations/${client_slug}/new?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
			window.location.assign(link);
		} catch (error) {
			toast({
				title: "Error",
				description: error instanceof Error ? error.message : "Failed to connect to Vercel",
				variant: "destructive",
			});
			setIsLoading(false);
		}
	};

	return (
		<Button
			onClick={handleConnect}
			disabled={isLoading}
			className="bg-black hover:bg-gray-900 text-white"
		>
			{isLoading ? (
				"Connecting..."
			) : (
				<div className="flex items-center space-x-2">
					<svg
						aria-hidden="true"
						width="16"
						height="16"
						viewBox="0 0 76 65"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
					>
						<path d="M37.5274 0L75.0548 65H0L37.5274 0Z" fill="white" />
					</svg>
					<span>Connect to Vercel</span>
				</div>
			)}
		</Button>
	);
};
