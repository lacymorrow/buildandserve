"use client";

import { IconBrandVercelFilled } from "@tabler/icons-react";
<<<<<<< HEAD:src/components/shipkit/vercel-connect-button.tsx
import crypto from "crypto";
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
||||||| bac2439d:src/components/buttons/vercel-connect-button.tsx
import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
=======
import { useRouter } from "next/navigation";
import { useState } from "react";
>>>>>>> upstream/main:src/components/buttons/vercel-connect-button.tsx
import { toast } from "sonner";
import { Link } from "@/components/primitives/link-with-transition";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { env } from "@/env";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { disconnectAccount, markVercelConnectionAttempt } from "@/server/actions/settings";
import type { User } from "@/types/user";

interface VercelConnectButtonProps {
  className?: string;
  user?: User;
  /** Server-side connection status - preferred over checking session accounts */
  isConnected?: boolean;
}

export const VercelConnectButton = ({
  className,
  user,
  isConnected: isConnectedProp,
}: VercelConnectButtonProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { toast: legacyToast } = useToast();

  // Use prop if provided, otherwise fall back to checking session accounts
  const hasVercelAccount = user?.accounts?.some((account) => account.provider === "vercel");
  const isConnected = isConnectedProp ?? !!hasVercelAccount;

<<<<<<< HEAD:src/components/shipkit/vercel-connect-button.tsx
	if (!process.env.NEXT_PUBLIC_VERCEL_INTEGRATION_SLUG) {
		return null;
	}
||||||| bac2439d:src/components/buttons/vercel-connect-button.tsx
	if (!process.env.NEXT_PUBLIC_VERCEL_INTEGRATION_SLUG && process.env.NODE_ENV === "production") {
		console.warn("Vercel integration slug is not set");
		return null;
	}
=======
  if (!env.NEXT_PUBLIC_FEATURE_VERCEL_INTEGRATION_ENABLED) {
    return null;
  }
>>>>>>> upstream/main:src/components/buttons/vercel-connect-button.tsx

  const handleConnect = async () => {
    try {
      setIsLoading(true);

      // Record the connection attempt in the database
      await markVercelConnectionAttempt();

      // the integration URL slug from vercel
      const client_slug = env.NEXT_PUBLIC_VERCEL_INTEGRATION_SLUG;

<<<<<<< HEAD:src/components/shipkit/vercel-connect-button.tsx
			// create a CSRF token and store it locally
			const state = crypto.randomBytes(16).toString("hex");
			localStorage.setItem("latestCSRFToken", state);
||||||| bac2439d:src/components/buttons/vercel-connect-button.tsx
			// create a CSRF token and store it in a secure cookie
			const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
				.map((b) => b.toString(16).padStart(2, "0"))
				.join("");

			// Store CSRF token in a secure, httpOnly cookie (via server action would be better, but using JS for now)
			// Set SameSite=Lax to allow the OAuth redirect while preventing CSRF
			document.cookie = `vercel_oauth_state=${state}; path=/; SameSite=Lax; Secure; Max-Age=600`;
=======
      // create a CSRF token and store it in a secure cookie
      const state = Array.from(crypto.getRandomValues(new Uint8Array(16)))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      // Store CSRF token in a cookie for validation on callback
      // SameSite=Lax allows the cookie to be sent on the OAuth redirect back
      // Secure ensures cookie is only sent over HTTPS
      const isSecure = window.location.protocol === "https:";
      document.cookie = `vercel_oauth_state=${state}; path=/;${isSecure ? " Secure;" : ""} SameSite=Lax; Max-Age=600`;
>>>>>>> upstream/main:src/components/buttons/vercel-connect-button.tsx

      // Redirect to Vercel's external installation flow
      // Vercel uses the Redirect URL configured in the Integration Console for the callback
      // The state param is forwarded back for CSRF protection
      const link = `https://vercel.com/integrations/${client_slug}/new?state=${state}`;
      window.location.assign(link);
    } catch (error) {
      legacyToast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to connect to Vercel",
        variant: "destructive",
      });
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (isLoading) return;

    setIsLoading(true);
    try {
      const result = await disconnectAccount("vercel");

      if (!result.success) {
        toast.error(result.error ?? "Failed to disconnect Vercel account");
        return;
      }

      toast.success(result.message);

      // Refresh to update the UI with the new connection state
      router.refresh();
    } catch (error) {
      console.error("Disconnect Vercel error:", error);
      toast.error("An unexpected error occurred");
    } finally {
      setIsLoading(false);
    }
  };

<<<<<<< HEAD:src/components/shipkit/vercel-connect-button.tsx
			toast.success(result.message);

			// Force a full session update to ensure the UI reflects the change
			await updateSession({ force: true });
		} catch (error) {
			console.error("Disconnect Vercel error:", error);
			toast.error("An unexpected error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			{isConnected ? (
				<div className={cn("flex flex-col items-center justify-center gap-1", className)}>
					<Link
						href="https://vercel.com/dashboard"
						className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
						target="_blank"
						rel="noopener noreferrer"
					>
						<IconBrandVercelFilled className="mr-2 h-4 w-4" />
						View Vercel Dashboard
					</Link>
					<Tooltip delayDuration={200}>
						<TooltipTrigger asChild>
							<Button
								onClick={() => void handleDisconnect()}
								variant="link"
								size="sm"
								disabled={isLoading}
								className="text-muted-foreground"
							>
								Connected - Click to disconnect
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Remove Vercel account connection</p>
						</TooltipContent>
					</Tooltip>
				</div>
			) : (
				<Button onClick={handleConnect} disabled={isLoading} className={cn("", className)}>
					<IconBrandVercelFilled className="mr-2 h-4 w-4" />
					{isLoading ? "Connecting..." : "Connect Vercel"}
				</Button>
			)}
		</>
	);
||||||| bac2439d:src/components/buttons/vercel-connect-button.tsx
			toast.success(result.message);

			// Force a full session update to ensure the UI reflects the change
			await updateSession({ force: true });
		} catch (error) {
			console.error("Disconnect Vercel error:", error);
			toast.error("An unexpected error occurred");
		} finally {
			setIsLoading(false);
		}
	};

	return (
		<>
			{isConnected ? (
				<div className={cn("flex flex-col items-center justify-center gap-1", className)}>
					<a
						href="https://vercel.com/dashboard"
						className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
						target="_blank"
						rel="noopener noreferrer"
					>
						<IconBrandVercelFilled className="mr-2 h-4 w-4" />
						View Vercel Dashboard
					</a>
					<Tooltip delayDuration={200}>
						<TooltipTrigger asChild>
							<Button
								onClick={handleDisconnect}
								variant="link"
								size="sm"
								disabled={isLoading}
								className="text-muted-foreground"
							>
								Connected - Click to disconnect
							</Button>
						</TooltipTrigger>
						<TooltipContent>
							<p>Remove Vercel account connection</p>
						</TooltipContent>
					</Tooltip>
				</div>
			) : (
				<Button
					size="lg"
					onClick={() => void handleConnect()}
					disabled={isLoading}
					className={cn("", className)}
				>
					<IconBrandVercelFilled className="mr-2 h-4 w-4" />
					{isLoading ? "Connecting..." : "Connect Vercel"}
				</Button>
			)}
		</>
	);
=======
  return (
    <>
      {isConnected ? (
        <div className={cn("flex flex-col items-center justify-center gap-1", className)}>
          <a
            href="https://vercel.com/dashboard"
            className={cn(buttonVariants({ variant: "outline", size: "lg" }), "w-full")}
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconBrandVercelFilled className="mr-2 h-4 w-4" />
            View Vercel Dashboard
          </a>
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <Button
                onClick={handleDisconnect}
                variant="link"
                size="sm"
                disabled={isLoading}
                className="text-muted-foreground"
              >
                Disconnect from Vercel
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Remove Vercel account integration</p>
            </TooltipContent>
          </Tooltip>
        </div>
      ) : (
        <Button
          size="lg"
          onClick={() => void handleConnect()}
          disabled={isLoading}
          className={cn("", className)}
        >
          <IconBrandVercelFilled className="mr-2 h-4 w-4" />
          {isLoading ? "Connecting..." : "Connect Vercel"}
        </Button>
      )}
    </>
  );
>>>>>>> upstream/main:src/components/buttons/vercel-connect-button.tsx
};
