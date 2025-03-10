import { FontProvider } from "@/components/providers/font-provider";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface TypographyProviderProps extends HTMLAttributes<HTMLDivElement> {
	unstyled?: boolean;
}

export function TypographyProvider({ children, className, unstyled, ...props }: TypographyProviderProps) {
	return (
		<FontProvider
			className={cn(
				!unstyled && "prose prose-slate dark:prose-invert",
				className
			)}
			{...props}
		>
			{children}
		</FontProvider>
	)
}
