"use client";

import { Icons } from "@/components/assets/icons";
import { Button } from "@/components/ui/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { disconnectGitHub, updateGitHubUsername } from "@/server/actions/github";
import { useSession } from "next-auth/react";
import { useState, useEffect } from "react";
import { toast } from "sonner";

// Ensure GitHubSession matches the expected session structure
interface GitHubSession {
    user?: { // Make user optional to handle loading/unauthenticated states
        id?: string;
        email?: string;
        githubUsername?: string | null;
    };
}

export const GitHubConnectDialog = ({ className }: { className?: string }) => {
    const { data: session, update: updateSession, status } = useSession();
    const [isLoading, setIsLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [usernameInput, setUsernameInput] = useState("");

    const user = (session as GitHubSession | null)?.user;
    const githubUsername = user?.githubUsername;
    const isConnected = !!githubUsername;
    const isAuthenticated = status === "authenticated";

    // Effect to update input field when dialog opens or username changes
    useEffect(() => {
        if (dialogOpen) {
            setUsernameInput(githubUsername || "");
        }
    }, [dialogOpen, githubUsername]);

    const handleConnect = async () => {
        if (!user?.id || !usernameInput.trim()) return;
        // Avoid updating if the username hasn't changed
        if (isConnected && usernameInput.trim() === githubUsername) {
            toast.info("GitHub username is already set to this value.");
            setDialogOpen(false);
            return;
        }

        setIsLoading(true);
        try {
            const result = await updateGitHubUsername(usernameInput.trim());
            if (result.success) {
                // Let the server action handle session update via updateSession
                // The useSession hook should pick up the changes automatically after revalidation
                toast.success(`GitHub username ${isConnected ? "updated to" : "set to"}: ${result.githubUsername}`);
                setDialogOpen(false); // Close dialog on success
            } else {
                // This path might not be reached if updateGitHubUsername throws errors
                toast.error("Failed to update GitHub username. Please try again.");
            }
        } catch (error) {
            console.error("GitHub connect error:", error);
            toast.error(error instanceof Error ? error.message : "Failed to update GitHub username. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    const handleDisconnect = async () => {
        if (!user?.id || !isConnected) return;

        setIsLoading(true);
        try {
            await disconnectGitHub();
            // Force a full session update to ensure the UI reflects the change immediately
            await updateSession({ force: true });
            toast.success("GitHub account disconnected successfully");
            setUsernameInput(""); // Clear input on disconnect
            setDialogOpen(false); // Close dialog on success
        } catch (error) {
            console.error("GitHub disconnect error:", error);
            toast.error("Failed to disconnect GitHub account. Please try again.");
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
                <Button
                    variant="outline"
                    className={cn("w-full", className)}
                    disabled={status === "loading" || !isAuthenticated}
                >
                    <Icons.github className="mr-2 h-4 w-4" />
                    {status === "loading"
                        ? "Loading..."
                        : !isAuthenticated
                            ? "Login to Connect GitHub"
                            : isConnected
                                ? `Connected as ${githubUsername}`
                                : "Connect GitHub Manually"}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>{isConnected ? "Update" : "Connect"} GitHub Account</DialogTitle>
                    <DialogDescription>
                        {isConnected
                            ? "Update your GitHub username below or disconnect the account."
                            : "Enter your GitHub username to connect your account manually."}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                        <Label htmlFor="github-username" className="text-right">
                            Username
                        </Label>
                        <Input
                            id="github-username"
                            value={usernameInput}
                            onChange={(e) => setUsernameInput(e.target.value)}
                            className="col-span-3"
                            placeholder="Your GitHub Username"
                            disabled={isLoading}
                        />
                    </div>
                </div>
                <DialogFooter className="sm:justify-between">
                    {isConnected && (
                        <Button
                            variant="destructive"
                            onClick={() => void handleDisconnect()}
                            disabled={isLoading}
                            className="sm:mr-auto" // Pushes disconnect to the left on larger screens
                        >
                            {isLoading ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Disconnect
                        </Button>
                    )}
                    <div className="flex gap-2"> {/* Group close and save buttons */}
                        <DialogClose asChild>
                            <Button type="button" variant="secondary" disabled={isLoading}>
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            type="submit" // Changed to submit, assuming form context or similar handling
                            onClick={() => void handleConnect()} // Keep onClick for direct handling if no form
                            disabled={isLoading || !usernameInput.trim()}
                        >
                            {isLoading ? <Icons.spinner className="mr-2 h-4 w-4 animate-spin" /> : null}
                            {isConnected ? "Update Username" : "Connect Account"}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
