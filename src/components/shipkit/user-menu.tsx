"use client";

import { Link } from "@/components/primitives/link-with-transition";
import { UserMenuDropdown } from "@/components/shipkit/user-menu-dropdown";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { BorderBeam } from "@/components/ui/border-beam";
import { Button, buttonVariants } from "@/components/ui/button";
import { useSignInRedirectUrl } from "@/hooks/use-auth-redirect";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { updateTheme } from "@/server/actions/settings";
import { UserIcon } from "lucide-react";
import { useSession } from "next-auth/react";
import { useTheme } from "next-themes";
import * as React from "react";

type Theme = "light" | "dark" | "system";

interface UserMenuProps {
	size?: "default" | "sm";
	className?: string;
}

export const UserMenu: React.FC<UserMenuProps> = ({ size = "default", className }) => {
	const { data: session, status } = useSession();
	const signInRedirectUrl = useSignInRedirectUrl();
	const { theme, setTheme } = useTheme();
	const { toast } = useToast();
	const [isOpen, setIsOpen] = React.useState(false);

	const { isAdmin } = useIsAdmin(session?.user?.email);

	const handleThemeChange = React.useCallback(
		async (value: string) => {
			const newTheme = value as Theme;
			// Update the theme immediately for a snappy UI
			setTheme(newTheme);

			// Then persist to the database
			if (session?.user) {
				try {
					const result = await updateTheme(newTheme);
					if (!result.success) {
						toast({
							title: "Failed to save theme preference",
							description: result.error || "Your theme preference will reset on next visit.",
							variant: "destructive",
						});
						return;
					}
					toast({
						title: "Theme updated",
						description: result.message,
					});
				} catch (error) {
					console.error("Failed to update theme:", error);
					toast({
						title: "Failed to save theme preference",
						description: "Your theme preference will reset on next visit.",
						variant: "destructive",
					});
				}
			}
		},
		[session?.user, setTheme, toast]
	);

	// Handle keyboard shortcuts
	React.useEffect(() => {
		const handleKeyDown = async (e: KeyboardEvent) => {
			// Only handle if Command/Control is pressed
			if (!(e.metaKey || e.ctrlKey)) return;

			switch (e.key) {
				case "l":
					e.preventDefault();
					await handleThemeChange("light");
					break;
				case "d":
					if (e.shiftKey) {
						e.preventDefault();
						await handleThemeChange("dark");
					}
					break;
				case "b":
					e.preventDefault();
					await handleThemeChange("system");
					break;
			}
		};

		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, [handleThemeChange]);

	return (
		<div className={cn("relative rounded-full flex items-center justify-center aspect-square", size === "sm" ? "size-9" : "size-9")}>
			{/* Loading state */}
			{status === "loading" && (
				<BorderBeam size={size === "sm" ? 20 : 25} duration={1.5} delay={9} />
			)}

			{/* Not authenticated */}
			{session?.user ? (
				<UserMenuDropdown
					isOpen={isOpen}
					setIsOpen={setIsOpen}
					session={session}
					isAdmin={isAdmin}
					theme={theme}
					handleThemeChange={handleThemeChange}
				>
					<Button
						variant="ghost"
						size="icon"
						className={cn("relative rounded-full", size === "sm" ? "size-6" : "size-8", className)}
						aria-label="User menu"
					>
						<Avatar className={cn(size === "sm" ? "size-6" : "size-8")}>
							<AvatarImage
								src={session?.user?.image || ""}
								alt={session?.user?.name || "User avatar"}
								draggable={false}
							/>
							<AvatarFallback>{session?.user?.name?.[0]?.toUpperCase() || "?"}</AvatarFallback>
						</Avatar>
					</Button>
				</UserMenuDropdown>
			) : (
				<Link
					href={signInRedirectUrl}
					className={cn(buttonVariants({ variant: "ghost", size: "icon" }), "rounded-full cursor-pointer")}
				>
					<UserIcon className="size-6" />
				</Link>
			)}
		</div>
	);
};
