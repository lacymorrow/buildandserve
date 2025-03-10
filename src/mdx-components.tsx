import { Card } from "@/components/mdx/card";
import { CardGroup } from "@/components/mdx/card-group";
import { SecretGenerator } from "@/components/mdx/secret-generator";
import { siteConfig } from "@/config/site";
import type { MDXComponents } from "mdx/types";

// const fumadocsComponents = await import('fumadocs-ui/mdx');

export function useMDXComponents(components: MDXComponents): MDXComponents {
	return {
		// ...fumadocsComponents,
		...components,
		Card,
		CardGroup,
		SecretGenerator,
		SiteName: () => <>{siteConfig.name}</>,
	};
}
