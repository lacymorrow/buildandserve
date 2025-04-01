"use client";

import { FileIcon, LaptopIcon, MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import * as React from "react";

import { docsConfig } from "@/components/search/example";
import { Button } from "@/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
	CommandSeparator,
} from "@/components/ui/command";
import { DialogTitle } from "@/components/ui/dialog";
import { siteConfig } from "@/config/site-config";
import { cn } from "@/lib/utils";
import { is } from "@/lib/utils/is";
import type { DialogProps } from "@radix-ui/react-dialog";

export interface SearchMenuProps extends DialogProps {
	/**
	 * The title to display in the search menu dialog
	 * @default "Search Documentation"
	 */
	title?: string;

	/**
	 * Button variant for the trigger
	 * @default "outline"
	 */
	buttonVariant?: "default" | "destructive" | "outline" | "secondary" | "ghost" | "link";

	/**
	 * Custom button text
	 * @default "Search..."
	 */
	buttonText?: string | React.ReactNode;

	/**
	 * Whether to show the keyboard shortcut
	 * @default true
	 */
	showShortcut?: boolean;

	/**
	 * Custom button className
	 */
	buttonClassName?: string;

	/**
	 * Whether this is a minimal search (fewer options)
	 * @default false
	 */
	minimal?: boolean;
}

/**
 * Search menu component for searching documentation and accessing common actions
 * Can be configured for different use cases with props
 */
export function SearchMenu({
	title = `Search ${siteConfig.name}`,
	buttonVariant = "outline",
	buttonText = "Search...",
	showShortcut = true,
	buttonClassName,
	minimal = false,
	...props
}: SearchMenuProps) {
	const router = useRouter();
	const [open, setOpen] = React.useState(false);
	const { setTheme } = useTheme();
	const [isClient, setIsClient] = React.useState(false);
	const [isMacOS, setIsMacOS] = React.useState(false);

	React.useEffect(() => {
		const down = (e: KeyboardEvent) => {
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

			if ((e.key === "f" && (e.metaKey || e.ctrlKey) && e.shiftKey) || e.key === "/") {
				if (
					!(e.target instanceof HTMLElement) ||
					!e.target.isContentEditable
				) {
					e.preventDefault();
					setOpen((open) => !open);
				}
			}
		};

		document.addEventListener("keydown", down);
		return () => document.removeEventListener("keydown", down);
	}, [setOpen]);

	const runCommand = React.useCallback((command: () => unknown) => {
		setOpen(false);
		command();
	}, []);

	React.useEffect(() => {
		setIsClient(true);
		setIsMacOS(is.mac);
	}, []);

	return (
		<>
			<Button
				variant={buttonVariant}
				className={cn(
					"relative w-full justify-start rounded-[0.5rem] bg-muted/50 text-sm font-normal text-muted-foreground shadow-none sm:pr-12 md:w-36",
					buttonClassName
				)}
				size="sm"
				onClick={() => setOpen(true)}
				{...props}
			>
				<span className="inline-flex text-xs">{buttonText}</span>
				{showShortcut && (
					<kbd
						className={cn(
							"pointer-events-none absolute right-[0.3rem] top-[0.3rem] hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium lg:flex text-xs",
							"transition-opacity duration-300",
							isClient ? "opacity-100" : "opacity-0"
						)}
					>
						<span>
							{isMacOS ? "⌘" : "Ctrl+"}
						</span>K
					</kbd>
				)}
			</Button>
			<CommandDialog open={open} onOpenChange={setOpen}>
				<DialogTitle className="sr-only">{title}</DialogTitle>
				<CommandInput placeholder="Type a command or search..." />
				<CommandList>
					<CommandEmpty>No results found.</CommandEmpty>
					<CommandGroup heading="Links">
						{docsConfig.mainNav
							.filter((navitem) => !navitem.external)
							.map((navItem) => (
								<CommandItem
									key={navItem.href}
									value={navItem.title}
									onSelect={() => {
										runCommand(() => router.push(navItem.href as string));
									}}
								>
									<FileIcon className="mr-2 h-4 w-4" />
									{navItem.title}
								</CommandItem>
							))}
					</CommandGroup>
					{!minimal && (
						<>
							<CommandSeparator />
							<CommandGroup heading="Theme">
								<CommandItem onSelect={() => runCommand(() => setTheme("light"))}>
									<SunIcon className="mr-2 h-4 w-4" />
									Light
								</CommandItem>
								<CommandItem onSelect={() => runCommand(() => setTheme("dark"))}>
									<MoonIcon className="mr-2 h-4 w-4" />
									Dark
								</CommandItem>
								<CommandItem onSelect={() => runCommand(() => setTheme("system"))}>
									<LaptopIcon className="mr-2 h-4 w-4" />
									System
								</CommandItem>
							</CommandGroup>
						</>
					)}
				</CommandList>
			</CommandDialog>
		</>
	);
}
