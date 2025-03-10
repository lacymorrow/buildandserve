import { Card } from "@/components/mdx/card";
import { CardGroup } from "@/components/mdx/card-group";
import { SecretGenerator } from "@/components/mdx/secret-generator";
import { TypographyProvider } from "@/components/providers/typography-provider";
import * as AlertComponents from "@/components/ui/alert";
import { siteConfig } from "@/config/site";
import type { MDXComponents } from "mdx/types";

// const fumadocsComponents = await import('fumadocs-ui/mdx');

export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		// ...fumadocsComponents,
		wrapper: ({ children }) => (
			<TypographyProvider id="sk-mdx-wrapper" className="container mx-auto">
				{children}
			</TypographyProvider>
		),

		...AlertComponents,
		Card,
		CardGroup,
		SecretGenerator,
		SiteName: () => <>{siteConfig.name}</>,
		...components,
	};
}
