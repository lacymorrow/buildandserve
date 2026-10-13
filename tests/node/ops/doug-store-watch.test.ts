import { describe, expect, it } from "vitest";
import {
  closeQuietly,
  EVIDENCE_DIR_NAME,
  exitCodeFor,
  expiredRuns,
  HARNESS_CHECK,
  RETENTION_DAYS,
  resolveEvidenceBase,
  type StoreResult,
  toIncidents,
  verdictFor,
} from "../../../scripts/doug-store-watch";

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

  it("never files a store ticket when the harness itself crashed", () => {
    // A Playwright crash ("Target page, context or browser has been closed")
    // says nothing about Doug's store. Filing it as a store incident points a
    // client-facing ticket at a store that is actually fine. Observed on the
    // 2026-10-13T12:23Z run, which reported `purplehaze:harness` as degraded.
    const incidents = toIncidents(
      makeResult([{ name: HARNESS_CHECK, status: "fail", detail: "probe threw: ...closed" }]),
      DETECTED_AT
    );
    expect(incidents).toEqual([]);
  });

  it("still files the real store failures when the harness dies after them", () => {
    // A crash must suppress only the harness entry, never mask a genuine
    // outage the run had already observed.
    const incidents = toIncidents(
      makeResult([
        { name: "dns", status: "pass" },
        { name: "homepage", status: "fail", detail: "-> 503" },
        { name: HARNESS_CHECK, status: "fail", detail: "probe threw" },
      ]),
      DETECTED_AT
    );
    expect(incidents).toHaveLength(1);
    expect(incidents[0].severity).toBe("down");
    expect(incidents[0].failedChecks).not.toContain(HARNESS_CHECK);
  });
});

describe("verdictFor", () => {
  const PASSING = makeResult(PASS_ALL);

  it("is clean when every store passes", () => {
    expect(verdictFor([PASSING])).toBe("clean");
    expect(exitCodeFor("clean")).toBe(0);
  });

  it("is an incident when a store check fails", () => {
    const broken = makeResult([{ name: "homepage", status: "fail" }]);
    expect(verdictFor([PASSING, broken])).toBe("incident");
    expect(exitCodeFor("incident")).toBe(1);
  });

  it("needs adaptation when a store only adapted", () => {
    const adapted = makeResult([
      { name: "homepage", status: "pass" },
      { name: "product_page", status: "adapt" },
    ]);
    expect(verdictFor([PASSING, adapted])).toBe("needs_adaptation");
    expect(exitCodeFor("needs_adaptation")).toBe(2);
  });

  it("exits 3 on a harness crash instead of blaming the store", () => {
    // The runbook splits these deliberately: exit 3 means "fix the harness",
    // exit 1 means "file a ticket against the store". A browser crash took the
    // exit-1 path on 2026-10-13T12:23Z.
    const crashed = makeResult([{ name: HARNESS_CHECK, status: "fail", detail: "probe threw" }]);
    expect(verdictFor([PASSING, crashed])).toBe("harness_error");
    expect(exitCodeFor("harness_error")).toBe(3);
  });

  it("reports a real outage even when another store's harness crashed", () => {
    // Two stores, one run. A crash probing store B must not swallow store A's
    // outage, which still needs its ticket and its DM.
    const down = makeResult([{ name: "dns", status: "fail" }]);
    const crashed = makeResult([{ name: HARNESS_CHECK, status: "fail" }]);
    expect(verdictFor([down, crashed])).toBe("incident");
  });
});

describe("closeQuietly", () => {
  it("swallows a cleanup failure so it cannot discard a finished probe", async () => {
    // The 2026-10-13T12:23Z run lost every thepurplehaze check — DNS, TLS,
    // homepage, cart, checkout — because `context.close()` threw in a finally
    // after they had all already run and been recorded.
    await expect(
      closeQuietly({
        close: () => Promise.reject(new Error("Target page, context or browser has been closed")),
      })
    ).resolves.toBeUndefined();
  });

  it("still closes on the happy path", async () => {
    let closed = false;
    await closeQuietly({
      close: () => {
        closed = true;
        return Promise.resolve();
      },
    });
    expect(closed).toBe(true);
  });
});

describe("resolveEvidenceBase", () => {
  const MAIN = "/Users/lacy/repo/buildandserve";

  it("writes into the checkout it was run from when that checkout is the main one", () => {
    expect(resolveEvidenceBase(MAIN, null)).toBe(`${MAIN}/${EVIDENCE_DIR_NAME}`);
  });

  it("escapes a disposable worktree and writes into the main checkout (LAC-4300)", () => {
    // Paperclip wakes the agent inside .paperclip/worktrees/<issue>/, which is
    // deleted when the issue closes. Evidence written there does not survive
    // 30 days, which is the whole point of keeping it.
    const worktree = `${MAIN}/.paperclip/worktrees/LAC-4299-doug-store-watch-every-4h-read-only`;
    const gitFile = `gitdir: ${MAIN}/.git/worktrees/LAC-4299-doug-store-watch-every-4h-read-only\n`;
    expect(resolveEvidenceBase(worktree, gitFile)).toBe(`${MAIN}/${EVIDENCE_DIR_NAME}`);
  });

  it("falls back to the current checkout when the .git pointer is not a worktree pointer", () => {
    // A submodule or a relocated gitdir. Unknown shape must not throw or write
    // evidence somewhere unrelated.
    expect(resolveEvidenceBase(MAIN, "gitdir: /somewhere/else/modules/thing\n")).toBe(
      `${MAIN}/${EVIDENCE_DIR_NAME}`
    );
  });
});

describe("expiredRuns", () => {
  const NOW = Date.parse("2026-11-12T00:00:00.000Z");
  const daysAgo = (d: number) => NOW - d * 86_400_000;

  it("keeps everything inside the 30-day retention window", () => {
    const runs = [
      { name: "2026-11-12T00-00-00-000Z", mtimeMs: NOW },
      { name: "2026-11-11T20-00-00-000Z", mtimeMs: daysAgo(0.2) },
      { name: "2026-10-14T00-00-00-000Z", mtimeMs: daysAgo(29) },
    ];
    expect(expiredRuns(runs, NOW)).toEqual([]);
  });

  it("drops runs older than the retention window", () => {
    const runs = [
      { name: "fresh", mtimeMs: daysAgo(1) },
      { name: "stale", mtimeMs: daysAgo(31) },
      { name: "ancient", mtimeMs: daysAgo(400) },
    ];
    expect(expiredRuns(runs, NOW)).toEqual(["stale", "ancient"]);
  });

  it("uses a 30-day window by default", () => {
    expect(RETENTION_DAYS).toBe(30);
    expect(expiredRuns([{ name: "edge", mtimeMs: daysAgo(30.5) }], NOW)).toEqual(["edge"]);
    expect(expiredRuns([{ name: "edge", mtimeMs: daysAgo(29.5) }], NOW)).toEqual([]);
  });
});
