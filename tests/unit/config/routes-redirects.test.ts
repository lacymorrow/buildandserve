import { describe, expect, it } from "vitest";

import { redirects, routes } from "../../../src/config/routes";

// LAC-3146: legacy AI-fleet URLs permanently redirect to lacymorrow.com,
// while the pages themselves live on at new buildandserve URLs.
describe("AI-fleet service redirects", () => {
  it("redirects legacy /services/openclaw and /services/paperclip to lacymorrow.com", async () => {
    const redirectList = await redirects();

    for (const source of ["/services/openclaw", "/services/paperclip"]) {
      const redirect = redirectList.find((r) => r.source === source);
      expect(redirect).toBeDefined();
      expect(redirect?.destination).toMatch(/^https:\/\/lacymorrow\.com/);
      expect(redirect?.permanent).toBe(true);
    }
  });

  it("serves the relocated pages at URLs not shadowed by a redirect", async () => {
    const redirectList = await redirects();
    const redirectSources = new Set(redirectList.map((r) => r.source));

    expect(routes.servicesOpenclaw).toBe("/services/openclaw-setup");
    expect(routes.servicesPaperclip).toBe("/services/paperclip-ai");
    expect(redirectSources.has(routes.servicesOpenclaw)).toBe(false);
    expect(redirectSources.has(routes.servicesPaperclip)).toBe(false);
  });
});
