import { BuyButton } from "@/components/buttons/buy-button";
import { GitHubConnectButton } from "@/components/buttons/github-connect-button";
import { LoginButton } from "@/components/buttons/login-button";
import { VercelDeployButton } from "@/components/shipkit/vercel-deploy-button";
import { Button } from "@/components/ui/button";
import { BASE_URL } from "@/config/base-url";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";
import { getOrdersByEmail } from "@/lib/lemonsqueezy";
import { downloadRepo } from "@/server/actions/github/download-repo";
import { auth } from "@/server/auth";
import { apiKeyService } from "@/server/services/api-key-service";
import { DownloadIcon } from "lucide-react";
import type { Session } from "next-auth";

export const DownloadSection = async () => {
	const session = await auth() as Session | null;

	// If not authenticated, show login button
	if (!session?.user) {
		return (
			<div className="flex flex-wrap items-stretch justify-stretch max-w-md">
				<LoginButton
					size="lg"
					className="w-full"
				>
					Sign in to download {siteConfig.name}
				</LoginButton>
			</div>
		);
	}

	const userId = session.user.id;

	// Check if user has purchased the product
	const orders = session.user.email ? await getOrdersByEmail(session.user.email) : [];
	const hasPurchased = orders.length > 0;

	// If authenticated but not purchased, show buy button
	if (!hasPurchased) {
		return (
			<div className="flex flex-wrap items-stretch justify-stretch max-w-md">
				<BuyButton />
				<p className="w-full text-sm text-muted-foreground mt-2">
					Purchase required to download {siteConfig.name}
				</p>
			</div>
		);
	}

	// Run all async operations in parallel
	const userApiKeys = await apiKeyService.getUserApiKeys(userId);

	// Get the user's API key
	let apiKey: string | undefined;
	if (userApiKeys.length > 0) {
		apiKey = userApiKeys[0].apiKey.key;
	}

	// Redirect after deploy to /vercel/deploy/${apiKey}
	const deployUrl = new URL(routes.external.vercelImportShipkit);
	const redirectUrl = deployUrl.searchParams.get("redirect-url");
	if (apiKey) {
		deployUrl.searchParams.set("redirect-url", encodeURIComponent(`${redirectUrl ?? BASE_URL}${routes.vercelDeploy}/${apiKey}`));
	}
	const vercelDeployHref = deployUrl.toString();

	// User is authenticated and has purchased, show download options
	return (
		<div className="flex flex-wrap items-stretch justify-stretch max-w-md gap-3">
			<div className="flex flex-wrap items-stretch justify-stretch w-full gap-3">
				{/* Download button */}
				<form action={downloadRepo}>
					<Button
						type="submit"
						size="lg"
						variant="outline"
						className="w-full"
					>
						<DownloadIcon className="mr-2 h-4 w-4" />
						Download {siteConfig.name}
					</Button>
				</form>

				<VercelDeployButton className="grow" href={vercelDeployHref} />
			</div>
			{/* GitHub connection section */}
			<GitHubConnectButton className="w-full" />
		</div>
	);
};
