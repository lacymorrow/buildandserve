import { Card } from "@/components/mdx/card";
import { CardGroup } from "@/components/mdx/card-group";
import { SecretGenerator } from "@/components/mdx/secret-generator";
import { TypographyProvider } from "@/components/providers/typography-provider";
import * as AlertComponents from "@/components/ui/alert";
import { FileTree } from "@/components/ui/file-tree";
import { siteConfig } from "@/config/site-config";
import * as RadixIcons from "@radix-ui/react-icons";
import * as LucideIcons from "lucide-react";
import type { MDXComponents } from "mdx/types";

// const fumadocsComponents = await import('fumadocs-ui/mdx');

export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		// ...fumadocsComponents,
		wrapper: ({ children }) => (
			<TypographyProvider id="sk-mdx-wrapper" className="container mx-auto py-10">
				{children}
			</TypographyProvider>
		),

		...LucideIcons,
		...RadixIcons,

		...AlertComponents,
		Card,
		CardGroup,
		FileTree,
		SecretGenerator,
		SiteName: () => <>{siteConfig.name}</>,
		...components,
	};
}
