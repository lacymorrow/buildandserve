/***
 * ! CMS - Include both Payload CMS and Builder.io CMS and configured to work together
 * ? Payload CMS
 * ? Builder.io
 */

import { RenderBuilderContent } from "@/app/(app)/(integrations)/builder.io/[...slug]/builder-io";
import { env } from "@/env";
import { getPayloadClient } from "@/lib/payload/payload";
import type { Media } from "@/payload-types";
import type { PageBlock } from "@/types/blocks";
import { builder } from "@builder.io/sdk";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlockRenderer } from "../payload-blocks";


import { AppLayout } from "@/components/layouts/app-layout";
import "@/styles/builder-io.css";

// Initialize Builder only if API key is available
const builderApiKey = env?.NEXT_PUBLIC_BUILDER_API_KEY;
const isBuilderEnabled = !!builderApiKey && env?.DISABLE_BUILDER !== "true";

if (isBuilderEnabled) {
	builder.init(builderApiKey);
}

interface PageProps {
	params: Promise<{
		slug: string[];
	}>;
	searchParams: Promise<{
		preview?: string;
	}>;
}

export async function generateMetadata({ params: paramsPromise, searchParams: searchParamsPromise }: PageProps): Promise<Metadata> {
	const params = await paramsPromise;
	const searchParams = await searchParamsPromise;
	const slugString = params.slug.join("/");
	const isPreview = searchParams.preview === "true";

	// Try to get metadata from Payload first
	const payload = await getPayloadClient();

	// First try with the joined slug
	let page = await payload?.find({
		collection: "pages",
		where: {
			slug: {
				equals: slugString,
			},
			// Don't filter by publishedAt to allow finding unpublished pages
		},
	});

	// If no results, try with just the first segment of the slug
	if (!page?.docs.length && params.slug.length > 0) {
		page = await payload?.find({
			collection: "pages",
			where: {
				slug: {
					equals: params.slug[0],
				},
				// Don't filter by publishedAt to allow finding unpublished pages
			},
		});
	}

	if (page?.docs[0]) {
		const { meta } = page.docs[0];

		const isMedia = (image: any): image is Media => {
			return image && typeof image === 'object' && 'url' in image;
		};

		return {
			title: meta?.title,
			description: meta?.description,
			openGraph: meta?.image && isMedia(meta.image) && meta.image.url
				? {
					images: [{
						url: meta.image.url,
						width: 1200,
						height: 630
					}],
				}
				: undefined,
		};
	}

	// If no Payload page, try Builder.io if enabled
	if (isBuilderEnabled) {
		try {
			const builderContent = await builder
				.get("page", {
					userAttributes: {
						urlPath: `/${slugString}`,
					},
					prerender: false,
				})
				.toPromise();

			if (builderContent) {
				// Extract metadata from Builder.io content if available
				return {
					title: builderContent.data?.title || "Page",
					description: builderContent.data?.description || "",
				};
			}
		} catch (error) {
			// Silently handle errors
		}
	}

	// Default metadata if no content found
	return {
		title: "Page Not Found",
		description: "The requested page could not be found.",
	};
}

export default async function Page({ params: paramsPromise, searchParams: searchParamsPromise }: PageProps) {
	const params = await paramsPromise;
	const searchParams = await searchParamsPromise;
	const slugString = params.slug.join("/");
	const isPreview = searchParams.preview === "true";

	// Try Payload CMS first
	const payload = await getPayloadClient();

	// First try with the joined slug
	let pageQuery = await payload?.find({
		collection: "pages",
		where: {
			slug: {
				equals: slugString,
			},
		},
		depth: 2,
	});

	// If no results, try with just the first segment of the slug
	if (pageQuery?.docs?.length === 0 && params.slug.length > 0) {
		pageQuery = await payload?.find({
			collection: "pages",
			where: {
				slug: {
					equals: params.slug[0],
				},
			},
			depth: 2,
		});
	}

	// Try a more flexible query if still not found
	if (pageQuery?.docs?.length === 0) {
		pageQuery = await payload?.find({
			collection: "pages",
			where: {
				slug: {
					like: params.slug[0],
				},
			},
			depth: 2,
		});
	}

	const payloadPage = pageQuery?.docs[0];

	// If Payload page exists, render it
	if (payloadPage) {
		return (
			<AppLayout>
				<BlockRenderer blocks={(payloadPage?.layout as PageBlock[]) ?? []} />
			</AppLayout>
		);
	}

	// If no Payload page, try Builder.io if enabled
	let builderContent = null;
	if (isBuilderEnabled) {
		try {
			builderContent = await builder
				.get("page", {
					userAttributes: {
						urlPath: `/${slugString}`,
					},
					prerender: false,
				})
				.toPromise();
		} catch (error) {
			// Silently handle errors
		}
	}

	// If Builder.io content exists, render it
	if (builderContent) {
		return (
			<>
				<RenderBuilderContent content={builderContent} model="page" />
			</>
		);
	}

	// If no content found in either CMS, return 404
	notFound();
}
