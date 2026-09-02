import { describe, expect, it } from "vitest";

import sitemap from "../../../src/app/sitemap";
import { siteConfig } from "../../../src/config/site-config";

// LAC-3466: prod served empty sitemaps. The old generateSitemaps() version
// switched on a numeric `id`, but Next passes the id as a string at runtime,
// so every request fell through to `default: return []`. robots.txt also
// pointed to /sitemap.xml, which multi-sitemap mode never serves (404).
// The fix is a single sitemap at /sitemap.xml with no id parameter.
describe("sitemap", () => {
  it("returns a non-empty sitemap without requiring an id", async () => {
    const entries = await sitemap();
    expect(entries.length).toBeGreaterThan(0);
  });

  it("includes the core indexable pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    for (const path of [
      "",
      "/services",
      "/services/openclaw-setup",
      "/services/paperclip-ai",
      "/features",
      "/pricing",
      "/contact",
      "/faq",
      "/work",
      "/work/twilio",
      "/blog",
      "/changelog",
      "/docs",
      "/terms-of-service",
      "/privacy-policy",
    ]) {
      expect(urls).toContain(`${siteConfig.url}${path}`);
    }
  });

  it("includes published blog posts", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(urls).toContain(`${siteConfig.url}/blog/welcome-to-build-and-serve`);
  });

  it("only emits absolute URLs on the production origin", async () => {
    const entries = await sitemap();
    for (const entry of entries) {
      expect(entry.url.startsWith(siteConfig.url)).toBe(true);
    }
  });

  it("does not emit duplicate URLs", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
