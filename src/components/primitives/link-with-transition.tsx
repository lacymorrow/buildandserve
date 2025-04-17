/*
 * Link component
 * Allows for page transitions during navigation
 *
 * @see https://nextjs.org/docs/app/api-reference/components/link
 */

import { siteConfig } from "@/config/site-config";
import { logger } from "@/lib/logger";
import { Link as TransitionsLink } from "next-view-transitions";
import { default as NextLink } from "next/link";
import type React from "react";

export const Link = ({
	children,
	...props
}: React.ComponentProps<typeof NextLink>) => {
	if (typeof props.href !== "string") {
		logger.warn("Link href must be a string", children, props);
		props.href = "#";
	}

	if (siteConfig?.behavior?.pageTransitions) {
		return <TransitionsLink prefetch {...props}>{children}</TransitionsLink>;
	}

	return <NextLink {...props}>{children}</NextLink>;
};
