"use client";

import { VercelConnectButton } from "@/components/shipkit/vercel-connect-button";
import { Button } from "@/components/ui/button";
import { deployToVercel } from "@/server/actions/vercel";
import { useSession } from "next-auth/react";
import { useState } from "react";
import { toast } from "sonner";

// Extend the User type to include accounts
declare module "next-auth" {
    interface User {
        accounts?: Array<{
            provider: string;
            [key: string]: any;
        }>;
    }
}

interface VercelDeployButtonProps {
    projectId?: string;
    className?: string;
}

export const VercelDeployButton = ({
    projectId,
    className,
}: VercelDeployButtonProps) => {
    const { data: session } = useSession();
    const [isDeploying, setIsDeploying] = useState(false);

    // Check if user has connected Vercel
    const hasVercelConnection = session?.user?.accounts?.some(
        (account) => account.provider === "vercel"
    );

    const handleDeploy = async () => {
        if (!projectId) {
            toast.error("No project selected for deployment");
            return;
        }

        setIsDeploying(true);
        try {
            const result = await deployToVercel(projectId);

            if (result.success) {
                toast.success(result.message || "Deployment initiated successfully");

                // If there's a deployment URL, you might want to open it in a new tab
                if (result.deploymentUrl) {
                    window.open(result.deploymentUrl, "_blank");
                }
            } else {
                toast.error(result.error || "Failed to deploy to Vercel");
            }
        } catch (error) {
            console.error("Deployment error:", error);
            toast.error("An unexpected error occurred during deployment");
        } finally {
            setIsDeploying(false);
        }
    };

    if (!hasVercelConnection) {
        return (
            <div className="flex flex-col space-y-2">
                <p className="text-sm text-muted-foreground">
                    Connect your Vercel account to deploy this project
                </p>
                <VercelConnectButton />
            </div>
        );
    }

    return (
        <Button
            onClick={handleDeploy}
            disabled={isDeploying || !projectId}
            className={`bg-black hover:bg-gray-900 text-white ${className}`}
        >
            {isDeploying ? (
                "Deploying..."
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
                    <span>Deploy to Vercel</span>
                </div>
            )}
        </Button>
    );
};
