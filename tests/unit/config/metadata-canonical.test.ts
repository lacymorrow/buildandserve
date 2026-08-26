import { describe, expect, it } from "vitest";

import { constructMetadata, defaultMetadata } from "../../../src/config/metadata";
import { siteConfig } from "../../../src/config/site-config";

// LAC-3466: Search Console flagged "Duplicate without user-selected canonical".
// Every indexable page must declare its own canonical; the site-wide default
// must NOT claim the homepage URL as the canonical for every page.
describe("canonical URL metadata", () => {
  it("sets a page-relative canonical when a path is provided", () => {
    const metadata = constructMetadata({ path: "/pricing" });
    expect(metadata.alternates?.canonical).toBe("/pricing");
  });

  it("preserves explicit alternates over the derived canonical", () => {
    const metadata = constructMetadata({
      path: "/pricing",
      alternates: { canonical: "/other" },
    });
    expect(metadata.alternates?.canonical).toBe("/other");
  });

  it("omits canonical entirely when no path is given", () => {
    const metadata = constructMetadata({ title: "No path" });
    expect(metadata.alternates).toBeUndefined();
  });

  it("does not declare a site-wide homepage canonical in defaultMetadata", () => {
    // A global canonical makes every inheriting page claim the homepage as its
    // canonical, which Google reports as duplicate-page errors.
    const canonical = (defaultMetadata.alternates as { canonical?: unknown } | null)?.canonical;
    expect(canonical).toBeUndefined();
  });

  it("resolves relative canonicals against the production origin", () => {
    expect(defaultMetadata.metadataBase?.origin).toBe(new URL(siteConfig.url).origin);
  });
});
