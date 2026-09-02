import type { Buffer } from "buffer";
import { readdir, stat } from "fs/promises";
import type { MetadataRoute } from "next";
import { join } from "path";
import { routes } from "@/config/routes";
import { siteConfig } from "@/config/site-config";

interface ContentFile {
  slug: string;
  path: string;
}

// Utility function to get content files
async function getContentFiles(contentDir: string): Promise<ContentFile[]> {
  try {
    let fullPath: string;

    // Docs are in root docs/ directory, other content is in src/content/
    if (contentDir === "docs") {
      fullPath = join(process.cwd(), "docs");
    } else {
      fullPath = join(process.cwd(), "src/content", contentDir);
    }

    const files = await readdir(fullPath, { recursive: true });
    return files
      .filter(
        (file: string | Buffer): file is string =>
          typeof file === "string" && (file.endsWith(".mdx") || file.endsWith(".md"))
      )
      .map((file: string) => ({
        slug: file.replace(/\.(mdx|md)$/, ""),
        path: join(fullPath, file),
      }));
  } catch (_error) {
    // Content directories are optional (docs/ may not exist in every deploy).
    return [];
  }
}

// Single sitemap served at /sitemap.xml — the URL robots.txt advertises.
// The previous generateSitemaps() version served /sitemap/{id}.xml instead
// (leaving /sitemap.xml a 404) and switched on a numeric id that Next passes
// as a string at runtime, so every sitemap rendered as an empty urlset.
// This site is far below the 50k-URL threshold where splitting matters.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // Fixed build date for static routes — only update when content actually changes.
  // Using new Date() would signal a change on every build, wasting crawl budget.
  const staticLastModified = new Date("2026-08-26");

  // Marketing pages (highest priority)
  const marketingRoutes = [
    {
      url: siteConfig.url,
      lastModified: staticLastModified,
      changeFrequency: "daily" as const,
      priority: 1,
    },
    {
      url: `${siteConfig.url}${routes.services}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}${routes.servicesOpenclaw}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    },
    {
      url: `${siteConfig.url}${routes.servicesPaperclip}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.85,
    },
    {
      url: `${siteConfig.url}${routes.features}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}${routes.pricing}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.9,
    },
    {
      url: `${siteConfig.url}${routes.contact}`,
      lastModified: staticLastModified,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    },
  ];

  // Case studies (no route constants — these pages live only under /work)
  const workRoutes = [
    "/work",
    "/work/credit-karma",
    "/work/longgame",
    "/work/swell-energy",
    "/work/twilio",
  ].map((path) => ({
    url: `${siteConfig.url}${path}`,
    lastModified: staticLastModified,
    changeFrequency: "monthly" as const,
    priority: 0.7,
  }));

  // Content indexes
  const contentIndexRoutes = [
    {
      url: `${siteConfig.url}${routes.blog}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.7,
    },
    {
      url: `${siteConfig.url}/changelog`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.5,
    },
    {
      url: `${siteConfig.url}${routes.docs}`,
      lastModified: staticLastModified,
      changeFrequency: "daily" as const,
      priority: 0.8,
    },
  ];

  // Support pages (lower priority)
  const supportRoutes = [
    {
      url: `${siteConfig.url}${routes.faq}`,
      lastModified: staticLastModified,
      changeFrequency: "weekly" as const,
      priority: 0.6,
    },
    {
      url: `${siteConfig.url}${routes.terms}`,
      lastModified: staticLastModified,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    },
    {
      url: `${siteConfig.url}${routes.privacy}`,
      lastModified: staticLastModified,
      changeFrequency: "monthly" as const,
      priority: 0.4,
    },
  ];

  const [blogFiles, docFiles] = await Promise.all([
    getContentFiles("blog"),
    getContentFiles("docs"),
  ]);

  const blogRoutes = await Promise.all(
    blogFiles.map(async (file) => {
      const stats = await stat(file.path);
      return {
        url: `${siteConfig.url}${routes.blog}/${file.slug}`,
        lastModified: stats.mtime,
        changeFrequency: "monthly" as const,
        priority: 0.6,
      };
    })
  );

  const docsRoutes = await Promise.all(
    docFiles.map(async (file) => {
      const stats = await stat(file.path);
      return {
        url: `${siteConfig.url}${routes.docs}/${file.slug}`,
        lastModified: stats.mtime,
        changeFrequency: "weekly" as const,
        priority: 0.7,
      };
    })
  );

  return [
    ...marketingRoutes,
    ...workRoutes,
    ...contentIndexRoutes,
    ...supportRoutes,
    ...blogRoutes,
    ...docsRoutes,
  ];
}
