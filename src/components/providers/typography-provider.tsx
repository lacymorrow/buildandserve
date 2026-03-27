import type { HTMLAttributes } from "react";
import { FontProvider } from "@/components/providers/font-provider";
import { cn } from "@/lib/utils";

<<<<<<< HEAD:src/components/providers/typography-provider.tsx
interface TypographyProviderProps extends HTMLAttributes<HTMLDivElement> {
	unstyled?: boolean;
||||||| bac2439d:src/components/primitives/prose.tsx
interface ProseProps extends HTMLAttributes<HTMLDivElement> {
	unstyled?: boolean;
=======
interface ProseProps extends HTMLAttributes<HTMLDivElement> {
  unstyled?: boolean;
>>>>>>> upstream/main:src/components/primitives/prose.tsx
}

<<<<<<< HEAD:src/components/providers/typography-provider.tsx
export function TypographyProvider({
	children,
	className,
	unstyled,
	...props
}: TypographyProviderProps) {
	// For some reason the body font class in the pages router doesn't get the font, so we need to wrap the children in a font provider
	return (
		<FontProvider
			className={cn(!unstyled && "prose prose-slate dark:prose-invert", className)}
			{...props}
		>
			{children}
		</FontProvider>
	);
||||||| bac2439d:src/components/primitives/prose.tsx
export function Prose({ children, className, unstyled, ...props }: ProseProps) {
	// For some reason the body font class in the pages router doesn't get the font, so we need to wrap the children in a font provider
	return (
		<FontProvider
			className={cn(!unstyled && "prose prose-slate dark:prose-invert", className)}
			{...props}
		>
			{children}
		</FontProvider>
	);
=======
export function Prose({ children, className, unstyled, ...props }: ProseProps) {
  // For some reason the body font class in the pages router doesn't get the font, so we need to wrap the children in a font provider
  return (
    <FontProvider
      className={cn(!unstyled && "prose prose-slate dark:prose-invert", className)}
      {...props}
    >
      {children}
    </FontProvider>
  );
>>>>>>> upstream/main:src/components/primitives/prose.tsx
}
