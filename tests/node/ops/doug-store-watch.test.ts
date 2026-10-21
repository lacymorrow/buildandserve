import { describe, expect, it } from "vitest";
import {
  type AddToCartOutcome,
  addToCartAdaptDetail,
  briefError,
  clickAddToCart,
  closeQuietly,
  exitCodeFor,
  HARNESS_CHECK,
  isResolverFault,
  RESOLVER_CHECK,
  type StoreResult,
  toIncidents,
  verdictFor,
} from "../../../scripts/doug-store-watch";
import {
  EVIDENCE_DIR_NAME,
  expiredRuns,
  RETENTION_DAYS,
  resolveEvidenceBase,
} from "../../../scripts/utils/store-watch-evidence";

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

  it("never files a store ticket when this machine's resolver did not answer", () => {
    // Without this the resolver entry falls through to the "degraded" branch
    // and files `raw-kratom:resolver` against the store, blaming Doug for our
    // nameserver (LAC-5278).
    const incidents = toIncidents(
      makeResult([{ name: RESOLVER_CHECK, status: "fail", detail: "resolver did not answer" }]),
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

describe("clickAddToCart", () => {
  const PLAYWRIGHT_CLICK_TIMEOUT = [
    "locator.click: Timeout 20000ms exceeded.",
    "Call log:",
    '  - waiting for getByRole("button", { name: /add to cart/i }).first()',
    "  - locator resolved to <button>Add to cart</button>",
  ].join("\n");

  /** A locator stand-in: `clicks` is the queue of outcomes per click attempt. */
  const target = (opts: { visible: boolean; clicks: ("ok" | "timeout")[] }) => {
    let attempt = 0;
    return {
      attempts: () => attempt,
      waitFor: () =>
        opts.visible
          ? Promise.resolve()
          : Promise.reject(
              new Error("locator.waitFor: Timeout 25000ms exceeded.\nCall log:\n  - x")
            ),
      scrollIntoViewIfNeeded: () => Promise.resolve(),
      click: () => {
        const next = opts.clicks[attempt++];
        return next === "ok"
          ? Promise.resolve()
          : Promise.reject(new Error(PLAYWRIGHT_CLICK_TIMEOUT));
      },
    };
  };

  it("adds the item on the first click and settles nothing", async () => {
    const notes: string[] = [];
    let settled = 0;
    const t = target({ visible: true, clicks: ["ok"] });

    const outcome = await clickAddToCart(t, "thepurplehaze.com", notes, async () => {
      settled++;
    });

    expect(outcome).toEqual({ added: true, stage: "click", error: "" });
    expect(t.attempts()).toBe(1);
    expect(settled).toBe(0);
    expect(notes).toEqual([]);
  });

  it("retries once after a settle and recovers from a single flaked click", async () => {
    // The 2026-10-16 20:03Z run on thepurplehaze.com: the control was visible,
    // one click timed out, and the next scheduled run added the same product
    // fine. One flake must not cost an agent wake.
    const notes: string[] = [];
    const order: string[] = [];
    const t = target({ visible: true, clicks: ["timeout", "ok"] });

    const outcome = await clickAddToCart(t, "thepurplehaze.com", notes, async () => {
      order.push("settle");
    });

    expect(outcome.added).toBe(true);
    expect(t.attempts()).toBe(2);
    // The settle (re-dismissing the age gate) must happen between the attempts,
    // not after the second one, or it clears the overlay too late to help.
    expect(order).toEqual(["settle"]);
    expect(notes).toEqual([
      "thepurplehaze.com: add-to-cart click failed (attempt 1 of 2: Timeout 20000ms exceeded.)",
      "thepurplehaze.com: add-to-cart click landed on retry",
    ]);
  });

  it("reports stage 'click' when a visible control refuses two clicks", async () => {
    const notes: string[] = [];
    const t = target({ visible: true, clicks: ["timeout", "timeout"] });

    const outcome = await clickAddToCart(t, "thepurplehaze.com", notes, async () => {});

    expect(outcome.added).toBe(false);
    expect(outcome.stage).toBe("click");
    expect(outcome.error).toBe("Timeout 20000ms exceeded.");
    expect(t.attempts()).toBe(2);
  });

  it("reports stage 'locate' when the control never appears, and never clicks", async () => {
    const notes: string[] = [];
    const t = target({ visible: false, clicks: [] });

    const outcome = await clickAddToCart(t, "raw-kratom.com", notes, async () => {});

    expect(outcome.added).toBe(false);
    expect(outcome.stage).toBe("locate");
    expect(t.attempts()).toBe(0);
    expect(notes).toEqual([
      "raw-kratom.com: no add-to-cart control became visible (Timeout 25000ms exceeded.)",
    ]);
  });
});

describe("addToCartAdaptDetail", () => {
  const URL = "https://thepurplehaze.com/products/top-shelf-pre-roll-5-pack-0-5g-each";
  const clicked: AddToCartOutcome = {
    added: false,
    stage: "click",
    error: "Timeout 20000ms exceeded.",
  };
  const missing: AddToCartOutcome = {
    added: false,
    stage: "locate",
    error: "Timeout 25000ms exceeded.",
  };

  it("does not claim the template changed when it was the click that timed out", () => {
    // The 20:03Z report said "No add-to-cart control matched ... the product
    // template likely changed". The control had matched and was visible, so
    // that sent the next agent looking for a rename that never happened.
    const detail = addToCartAdaptDetail(clicked, URL);
    expect(detail).not.toMatch(/template likely changed/);
    expect(detail).toMatch(/was found and visible/);
    expect(detail).toMatch(/not a template change/);
    expect(detail).toMatch(/re-run the job before adapting/i);
  });

  it("still sends the agent to find a renamed control when nothing matched", () => {
    const detail = addToCartAdaptDetail(missing, URL);
    expect(detail).toMatch(/No add-to-cart control matched/);
    expect(detail).toMatch(/template likely changed/);
  });

  it("quotes the Playwright error and the product URL in both cases", () => {
    for (const outcome of [clicked, missing]) {
      const detail = addToCartAdaptDetail(outcome, URL);
      expect(detail).toContain(URL);
      expect(detail).toContain(outcome.error);
    }
  });

  it("gives the two failure modes different text", () => {
    expect(addToCartAdaptDetail(clicked, URL)).not.toBe(addToCartAdaptDetail(missing, URL));
  });
});

describe("briefError", () => {
  it("keeps the finding and drops Playwright's call log", () => {
    const error = new Error(
      "locator.click: Timeout 20000ms exceeded.\nCall log:\n  - waiting for locator\n  - resolved"
    );
    expect(briefError(error)).toBe("Timeout 20000ms exceeded.");
  });

  it("drops the API-call prefix, which arrives mangled under Bun", () => {
    // Observed verbatim on 2026-10-16: playwright under Bun reports a
    // locator.waitFor timeout as "for: Timeout 25000ms exceeded.". Quoting that
    // in a report reads like the harness is broken.
    expect(briefError(new Error("for: Timeout 25000ms exceeded.\nCall log:\n  - x"))).toBe(
      "Timeout 25000ms exceeded."
    );
  });

  it("leaves a message alone when its prefix is not an API call", () => {
    const error = new Error("Protocol error (Runtime.callFunctionOn): Target closed");
    expect(briefError(error)).toBe("Protocol error (Runtime.callFunctionOn): Target closed");
  });

  it("truncates a single long line and survives a non-Error throw", () => {
    expect(briefError(new Error("x".repeat(400)))).toHaveLength(160);
    expect(briefError("plain string")).toBe("plain string");
    expect(briefError(undefined)).toBe("undefined");
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

  it("voids the whole run when this machine's resolver died, however bad it looked", () => {
    // LAC-5278: the host's only nameserver went away mid-run on
    // 2026-10-21T15:11Z. The job paged Lacy that thepurplehaze.com was DOWN and
    // raw-kratom.com could not take orders; both were serving 200s throughout.
    // A resolver fault is the one harness failure that outranks a store
    // failure, because every check starts by resolving a hostname.
    const unreachable = makeResult([{ name: RESOLVER_CHECK, status: "fail" }]);
    const lookedBroken = makeResult([
      { name: "dns", status: "pass" },
      { name: "checkout", status: "fail", detail: "landed chrome-error://chromewebdata/" },
    ]);
    expect(verdictFor([lookedBroken, unreachable])).toBe("harness_error");
    expect(exitCodeFor("harness_error")).toBe(3);
  });

  it("still calls a genuine NXDOMAIN an incident", () => {
    // The outage this job exists to catch (LACA-1909) is the apex A record
    // going away, which DNS answers authoritatively. Only an unanswered query
    // is a resolver fault, so the fix above must not mute a real outage.
    const gone = makeResult([
      { name: "dns", status: "fail", detail: "did not resolve: queryA ENOTFOUND" },
    ]);
    expect(verdictFor([gone])).toBe("incident");
  });
});

describe("isResolverFault", () => {
  it("treats an unanswered query as our problem", () => {
    // The exact error from the 2026-10-21T15:11Z run.
    const timeout = Object.assign(new Error("queryA ETIMEOUT thepurplehaze.com"), {
      code: "ETIMEOUT",
    });
    expect(isResolverFault(timeout)).toBe(true);
    expect(isResolverFault(Object.assign(new Error("x"), { code: "ESERVFAIL" }))).toBe(true);
    expect(isResolverFault(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe(true);
  });

  it("treats an authoritative answer as the store's problem", () => {
    // NXDOMAIN and NODATA are verdicts from DNS itself, which is what a dead
    // apex record looks like. These must keep reaching the ticket stream.
    expect(isResolverFault(Object.assign(new Error("x"), { code: "ENOTFOUND" }))).toBe(false);
    expect(isResolverFault(Object.assign(new Error("x"), { code: "ENODATA" }))).toBe(false);
  });

  it("does not crash on a throw that carries no code", () => {
    expect(isResolverFault(new Error("plain"))).toBe(false);
    expect(isResolverFault("string throw")).toBe(false);
    expect(isResolverFault(null)).toBe(false);
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
