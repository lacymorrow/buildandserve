import { describe, expect, it } from "vitest";
import { type StoreResult, toIncidents } from "../../../scripts/doug-store-watch";

const DETECTED_AT = "2026-10-12T18:00:00.000Z";

const makeResult = (
  checks: { name: string; status: "pass" | "fail" | "adapt"; detail?: string; evidence?: string }[]
): StoreResult => ({
  key: "raw-kratom",
  store: "raw-kratom.com",
  base: "https://raw-kratom.com",
  platform: "bigcommerce",
  checks: checks.map((c) => ({
    name: c.name,
    status: c.status,
    detail: c.detail ?? "",
    evidence: c.evidence,
  })),
  notes: [],
});

const PASS_ALL = [
  { name: "dns", status: "pass" as const },
  { name: "tls", status: "pass" as const },
  { name: "homepage", status: "pass" as const },
  { name: "product_page", status: "pass" as const },
  { name: "add_to_cart", status: "pass" as const },
  { name: "checkout", status: "pass" as const },
  { name: "signup_form", status: "pass" as const },
];

describe("toIncidents", () => {
  it("files nothing when every check passes", () => {
    expect(toIncidents(makeResult(PASS_ALL), DETECTED_AT)).toEqual([]);
  });

  it("collapses a total outage into exactly one 'down' ticket", () => {
    // The regression that motivated this job: a dead apex record fails DNS,
    // TLS, homepage, cart, checkout and signup at once. That is one outage and
    // must not produce six tickets.
    const incidents = toIncidents(
      makeResult([
        { name: "dns", status: "fail", detail: "did not resolve" },
        { name: "tls", status: "fail" },
        { name: "homepage", status: "fail" },
        { name: "product_page", status: "adapt" },
        { name: "signup_form", status: "fail" },
      ]),
      DETECTED_AT
    );

    expect(incidents).toHaveLength(1);
    expect(incidents[0].severity).toBe("down");
    expect(incidents[0].dedupeKey).toBe("raw-kratom:down");
    expect(incidents[0].slack).toBe(true);
    // First line must lead with what is broken and since when.
    expect(incidents[0].firstLine).toMatch(/^raw-kratom\.com is down: DNS does not resolve\./);
    expect(incidents[0].firstLine).toContain(DETECTED_AT);
  });

  it("treats a homepage failure as down even when DNS resolves", () => {
    const incidents = toIncidents(
      makeResult([
        { name: "dns", status: "pass" },
        { name: "homepage", status: "fail", detail: "-> 503" },
      ]),
      DETECTED_AT
    );
    expect(incidents).toHaveLength(1);
    expect(incidents[0].severity).toBe("down");
    expect(incidents[0].firstLine).toContain("the homepage is not returning 200");
  });

  it("files one checkout ticket when the store is up but cannot take orders", () => {
    const incidents = toIncidents(
      makeResult([
        { name: "dns", status: "pass" },
        { name: "homepage", status: "pass" },
        { name: "add_to_cart", status: "fail", detail: "cart reports empty" },
        { name: "checkout", status: "fail" },
      ]),
      DETECTED_AT
    );
    expect(incidents).toHaveLength(1);
    expect(incidents[0].severity).toBe("checkout_broken");
    expect(incidents[0].dedupeKey).toBe("raw-kratom:checkout");
    expect(incidents[0].slack).toBe(true);
  });

  it("files degraded issues separately and does not DM for them", () => {
    const incidents = toIncidents(
      makeResult([
        { name: "dns", status: "pass" },
        { name: "homepage", status: "pass" },
        { name: "add_to_cart", status: "pass" },
        { name: "checkout", status: "pass" },
        { name: "tls", status: "fail", detail: "expires in 9d" },
        { name: "signup_form", status: "fail", detail: "no credential field" },
      ]),
      DETECTED_AT
    );
    expect(incidents).toHaveLength(2);
    expect(incidents.every((i) => i.severity === "degraded")).toBe(true);
    expect(incidents.some((i) => i.slack)).toBe(false);
    expect(incidents.map((i) => i.dedupeKey).sort()).toEqual([
      "raw-kratom:signup_form",
      "raw-kratom:tls",
    ]);
  });

  it("keeps dedupeKey stable across runs so a repeat failure reopens instead of refiling", () => {
    const first = toIncidents(
      makeResult([{ name: "dns", status: "fail" }]),
      "2026-10-12T18:00:00.000Z"
    );
    const second = toIncidents(
      makeResult([{ name: "dns", status: "fail" }]),
      "2026-10-12T22:00:00.000Z"
    );
    expect(second[0].dedupeKey).toBe(first[0].dedupeKey);
    expect(second[0].detectedAt).not.toBe(first[0].detectedAt);
  });

  it("does not raise a ticket for an adaptation alone", () => {
    const incidents = toIncidents(
      makeResult([
        { name: "dns", status: "pass" },
        { name: "homepage", status: "pass" },
        { name: "product_page", status: "adapt" },
      ]),
      DETECTED_AT
    );
    expect(incidents).toEqual([]);
  });
});
