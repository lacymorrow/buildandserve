import fs from "fs";
import matter from "gray-matter";
import path from "path";
import { cache } from "react";
import { z } from "zod";
export const DocSchema = z.object({
	title: z.string(),
	description: z.string(),
	slug: z.string(),
	content: z.string(),
	keywords: z.array(z.string()).optional(),
	author: z.string().optional(),
	publishedAt: z.string().optional(),
	updatedAt: z.string().optional(),
	lastModified: z.date().optional(),
	section: z.enum([
		"getting-started",
		"core",
		"features",
		"integrations",
		"api-reference",
		"guides",
		"contributing",
	]),
	seo: z
		.object({
			canonicalUrl: z.string().optional(),
			focusKeywords: z.array(z.string()).optional(),
			metaRobots: z.array(z.string()).optional(),
		})
		.optional(),
});

export type Doc = z.infer<typeof DocSchema>;

export interface NavItem {
	title: string;
	href: string;
	description?: string;
	order?: number;
}

export interface NavSection {
	title: string;
	items: NavItem[];
}

export const getDocBySlug = cache(async (slug = "index") => {
	try {
		const doc = await import(`@/content/docs/${slug}.mdx`).catch((error) => {
			// Append /index to the slug if it doesn't exist
			const newSlug = slug.endsWith("/") ? `${slug}index` : `${slug}/index`;
			return import(`@/content/docs/${newSlug}.mdx`);
		});

		if (!doc) {
			return null;
		}
		const { default: Content, frontmatter } = doc;

		if (!frontmatter?.title) {
			console.warn(`Missing required frontmatter in doc: ${slug}`);
			return null;
		}

		return {
			...frontmatter,
			slug,
			content: Content,
			lastModified: frontmatter?.updatedAt ? new Date(frontmatter.updatedAt) : new Date(),
			section: frontmatter.section ?? "core",
		};
	} catch (error) {
		console.error(`Error reading doc: ${slug}`, error);
		return null;
	}
});

export async function getAllDocs(): Promise<Doc[]> {
	try {
		const docs = await Promise.all([
			// getDocBySlug("introduction"),
			// getDocBySlug("quickstart"),
			// getDocBySlug("development"),
			// getDocBySlug("env"),
			// getDocBySlug("ui"),
			// getDocBySlug("review-checklist"),
			// // Features
			// getDocBySlug("features/content-management"),
			// getDocBySlug("features/email"),
			// getDocBySlug("features/globe"),
			// getDocBySlug("features/ui-components"),
			// getDocBySlug("features/features-map"),
			// getDocBySlug("features/authentication"),
			// getDocBySlug("features/dashboard"),
			// getDocBySlug("features/admin-panel"),
			// getDocBySlug("features/development-tools"),
			// getDocBySlug("features/task-management"),
			// getDocBySlug("features/ai-integration"),
			// getDocBySlug("features/testing"),
			// getDocBySlug("features/deployment"),
			// getDocBySlug("features/monitoring"),
			// getDocBySlug("features/security"),
			// getDocBySlug("features/integrations"),
			// // Guides
			// getDocBySlug("guides/index"),
			// // Contributing
			// getDocBySlug("contributing"),
			// // Core
			// getDocBySlug("architecture"),
			// getDocBySlug("performance"),
			// getDocBySlug("migrations"),
			// getDocBySlug("security"),
			// getDocBySlug("testing"),
			// getDocBySlug("deployment"),
			// getDocBySlug("monitoring"),
			// getDocBySlug("database"),
			// getDocBySlug("api-design"),
			// getDocBySlug("error-handling"),
			// getDocBySlug("logging"),
			// getDocBySlug("analytics"),
		]);

		return docs.filter((doc): doc is NonNullable<typeof doc> => doc !== null);
	} catch (error) {
		console.error("Error loading docs:", error);
		return [];
	}
}

// async function processDirectory(dir: string): Promise<NavSection[]> {
// 	const sections: NavSection[] = [];

// 	try {
// 		// Use dynamic import with @ alias to get docs
// 		const docs =
// 			dir === ""
// 				? await import("@/content/docs/index.mdx")
// 				: await import(`@/content/docs/${dir}/index.mdx`);

// 		// Process the frontmatter
// 		const { frontmatter } = docs;

// 		// Add to sections
// 		sections.push({
// 			title: "Getting Started",
// 			items: [
// 				{
// 					title: frontmatter.title || "Introduction",
// 					href: `/docs/${dir}`,
// 					description: frontmatter.description,
// 				},
// 			],
// 		});

// 		return sections;
// 	} catch (error) {
// 		console.error("Error processing docs:", error);
// 		return [];
// 	}
// }
function processDirectory(dir: string): NavSection[] {
	console.info("Processing directory:", dir);
	try {
		const sections: NavSection[] = [];
		const rootPath = path.join(process.cwd(), "src/content/docs");
		const entries = fs.readdirSync(path.join(rootPath, dir), {
			withFileTypes: true,
		});
		// Process directories first
		for (const entry of entries.filter((entry) => entry.isDirectory())) {
			const sectionPath = path.join(dir, entry.name);
			const items: NavItem[] = [];
			// Read files in the directory
			const files = fs.readdirSync(path.join(rootPath, sectionPath));
			for (const file of files) {
				if (file.endsWith(".mdx")) {
					const filePath = path.join(rootPath, sectionPath, file);
					const content = fs.readFileSync(filePath, "utf-8");
					const { data } = matter(content);
					items.push({
						title: data.title || file.replace(".mdx", ""),
						href: `/docs/${sectionPath}/${file.replace(".mdx", "")}`,
					});
				}
			}
			if (items.length > 0) {
				sections.push({
					title: entry.name
						.split("-")
						.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
						.join(" "),
					items: items.sort((a, b) => a.title.localeCompare(b.title)),
				});
			}
		}
		// Process root MDX files
		const rootItems: NavItem[] = [];
		for (const entry of entries.filter((entry) => entry.isFile() && entry.name.endsWith(".mdx"))) {
			const filePath = path.join(rootPath, dir, entry.name);
			const content = fs.readFileSync(filePath, "utf-8");
			const { data } = matter(content);
			rootItems.push({
				title: data.title || entry.name.replace(".mdx", ""),
				href: `/docs/${entry.name.replace(".mdx", "")}`,
			});
		}
		if (rootItems.length > 0) {
			sections.unshift({
				title: "Getting Started",
				items: rootItems.sort((a, b) => {
					// Ensure 'Introduction' comes first
					if (a.title === "Introduction") return -1;
					if (b.title === "Introduction") return 1;
					return a.title.localeCompare(b.title);
				}),
			});
		}
		return sections;
	} catch (error) {
		console.error("Error processing docs:", error);
		return [];
	}
}

export const getDocsNavigation = cache(async (): Promise<NavSection[]> => {
	return processDirectory("");
});

// Add helper function to get doc from params
export async function getDocFromParams(params: Promise<{ slug?: string | string[] }>) {
	try {
		const resolvedParams = await params;
		const slug =
			typeof resolvedParams?.slug === "string"
				? resolvedParams?.slug
				: resolvedParams?.slug?.join("/");

		const doc = await getDocBySlug(slug);
		return doc;
	} catch (error) {
		console.error("Error getting doc from params:", error);
		throw error; // Let Next.js handle the 404
	}
}

// Recursively scans the docs directory and returns all slugs
async function findDocSlugsRecursive(
	dir: string,
	rootPath: string,
	currentSlugParts: string[] = []
): Promise<string[]> {
	let slugs: string[] = [];
	const fullPath = path.join(rootPath, dir);

	try {
		const entries = fs.readdirSync(fullPath, { withFileTypes: true });

		for (const entry of entries) {
			const entryPath = path.join(dir, entry.name);
			if (entry.isDirectory()) {
				const subSlugs = await findDocSlugsRecursive(entryPath, rootPath, [
					...currentSlugParts,
					entry.name,
				]);
				slugs = slugs.concat(subSlugs);
			} else if (entry.isFile() && entry.name.endsWith(".mdx")) {
				const fileNameWithoutExtension = entry.name.replace(".mdx", "");
				// Handle index files correctly (slug should be the directory path)
				const slug =
					fileNameWithoutExtension === "index"
						? currentSlugParts.join("/")
						: [...currentSlugParts, fileNameWithoutExtension].join("/");
				slugs.push(slug);
			}
		}
	} catch (error) {
		// Ignore errors like directory not found, etc., for robustness
		console.warn(
			`Warning: Could not read directory ${fullPath} while scanning for doc slugs:`,
			error
		);
	}

	return slugs;
}

export async function getAllDocSlugsFromFileSystem(): Promise<string[]> {
	const rootPath = path.join(process.cwd(), "src/content/docs");
	// Start scanning from the root, also add the root slug explicitly if index.mdx exists
	const allSlugs = await findDocSlugsRecursive("", rootPath);

	// Check if root index.mdx exists and add '' slug if not already present
	try {
		if (fs.existsSync(path.join(rootPath, "index.mdx")) && !allSlugs.includes("")) {
			allSlugs.push("");
		}
	} catch (error) {
		console.warn("Warning: Could not check for root index.mdx:", error);
	}

	return allSlugs;
}
