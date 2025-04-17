import { fontSans, fontSerif } from "@/config/fonts";
import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

interface FontProviderProps extends HTMLAttributes<HTMLDivElement> { }

export function FontProvider({ children, className, ...props }: FontProviderProps) {
	return (
		<div className={cn(
			"block w-full mx-auto",
			"antialiased",
			"font-sans font-normal leading-relaxed",
			fontSans.variable,
			fontSerif.variable,
			className
		)}
			{...props}
		>
			{children}
		</div>
	)
}
