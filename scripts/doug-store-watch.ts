#!/usr/bin/env bun
/**
 * Doug store watch (LAC-4280) — read-only health probe for the two client stores.
 *
 * This is the BAS implementation of docs/ops/doug-store-watch.md. The runbook is
 * the contract; this script is the evidence harness that makes a run's result
 * checkable instead of something an agent merely asserts. Every claim it emits
 * is backed by a captured HTTP code or a screenshot on disk.
 *
 * It is deliberately READ-ONLY: it browses, adds a line item to its own throwaway
 * cart session, and stops on the checkout page. It never submits an order, never
 * creates an account, and never writes to the stores.
 *
 * Product URLs are discovered at runtime from each platform's own index
 * (Shopify products.json, BigCommerce XML sitemap) rather than hardcoded, so a
 * renamed or sold-out product does not produce a false alarm. When discovery or
 * the cart interaction genuinely cannot proceed, the script exits NEEDS_ADAPTATION
 * so the agent takes over and records what changed.
 *
 * Usage:
 *   bun scripts/doug-store-watch.ts [--out <dir>] [--store <key>] [--base <url>]
 *
 * Evidence defaults to `<main checkout>/store-watch-runs/<timestamp>/` — the
 * main checkout, not the cwd, so a run from a disposable git worktree still
 * leaves evidence behind (LAC-4300). Runs past RETENTION_DAYS are pruned.
 *
 * Exit codes: 0 = all clean, 1 = incident (something is broken), 2 = needs agent
 * adaptation, 3 = harness error.
 */

import { promises as dns } from "node:dns";
import { access, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";
import { evidenceBaseFor, expiredRuns, RETENTION_DAYS } from "./utils/store-watch-evidence";

const TLS_MIN_DAYS = 14;
const NAV_TIMEOUT = 45_000;
const ATC_VISIBLE_TIMEOUT = 25_000;
const ATC_CLICK_TIMEOUT = 20_000;

export interface StoreSpec {
  key: string;
  label: string;
  base: string;
  platform: "shopify" | "bigcommerce";
  signupPath: string;
}

const STORES: StoreSpec[] = [
  {
    key: "raw-kratom",
    label: "raw-kratom.com",
    base: "https://raw-kratom.com",
    platform: "bigcommerce",
    signupPath: "/login.php?action=create_account",
  },
  {
    key: "purplehaze",
    label: "thepurplehaze.com",
    base: "https://thepurplehaze.com",
    platform: "shopify",
    signupPath: "/account/register",
  },
];

type CheckStatus = "pass" | "fail" | "adapt";

interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  httpCode?: number;
  evidence?: string;
}

export interface StoreResult {
  key: string;
  store: string;
  base: string;
  platform: string;
  checks: Check[];
  notes: string[];
}

type Severity = "down" | "checkout_broken" | "degraded";

/**
 * Check name reserved for the probe failing on its own terms (browser crash,
 * timeout starting a context). It is not a verdict about the store, so it never
 * becomes a store incident — see verdictFor.
 */
export const HARNESS_CHECK = "harness";

/**
 * Check name reserved for "this machine could not resolve names", as distinct
 * from "the store has no DNS record". Like HARNESS_CHECK it never becomes a
 * store incident, but it is stricter: it voids the whole run (see verdictFor).
 */
export const RESOLVER_CHECK = "resolver";

/** Neither of these is an observation about a store, so neither can be a ticket. */
const INFRA_CHECKS = new Set([HARNESS_CHECK, RESOLVER_CHECK]);

/**
 * c-ares error codes that mean the resolver never answered, as opposed to
 * answering "that name does not exist".
 *
 * The difference is the whole ballgame for this job. ENOTFOUND (NXDOMAIN) and
 * ENODATA are verdicts from DNS itself and are exactly the raw-kratom outage
 * this watch exists to catch (LACA-1909, the apex A record was gone). ETIMEOUT
 * and friends are not verdicts at all — they mean the question never got
 * answered, so the store's real state is unknown.
 */
const RESOLVER_FAULT_CODES = new Set([
  "ETIMEOUT",
  "ETIMEDOUT",
  "ESERVFAIL",
  "ECONNREFUSED",
  "EREFUSED",
  "ECANCELLED",
  "ENOTINITIALIZED",
  "ELOADIPHLPAPI",
  "EADDRGETNETWORKPARAMS",
]);

/** True when a DNS lookup failed because our resolver is unreachable, not because the name is gone. */
export function isResolverFault(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && RESOLVER_FAULT_CODES.has(code);
}

export type Verdict = "clean" | "incident" | "needs_adaptation" | "harness_error";

interface Incident {
  store: string;
  /** Stable across runs so the filing agent can dedupe instead of re-filing. */
  dedupeKey: string;
  severity: Severity;
  slack: boolean;
  title: string;
  firstLine: string;
  detectedAt: string;
  failedChecks: string[];
  evidence: string[];
}

/**
 * Collapse a store's failed checks into the tickets a human should actually get.
 *
 * A dead store fails DNS, TLS, homepage, product, cart and signup all at once.
 * Filing six tickets for one outage is how an alerting system gets muted, so a
 * store that is down produces exactly one "down" incident and the downstream
 * symptoms are folded into it.
 */
export function toIncidents(result: StoreResult, detectedAt: string): Incident[] {
  // A crashed probe or a dead resolver is our bug, not Doug's outage. Dropping
  // both here keeps them out of the ticket stream entirely; verdictFor turns
  // them into exit 3 instead.
  const failed = result.checks.filter((c) => c.status === "fail" && !INFRA_CHECKS.has(c.name));
  if (!failed.length) return [];

  const names = failed.map((c) => c.name);
  const evidence = result.checks.flatMap((c) => (c.evidence ? [c.evidence] : []));
  const detailOf = (n: string) => failed.find((c) => c.name === n)?.detail ?? "";

  if (names.includes("dns") || names.includes("homepage")) {
    const cause = names.includes("dns")
      ? "DNS does not resolve"
      : "the homepage is not returning 200";
    return [
      {
        store: result.store,
        dedupeKey: `${result.key}:down`,
        severity: "down",
        slack: true,
        title: `${result.store} is DOWN`,
        firstLine: `${result.store} is down: ${cause}. First seen by this job at ${detectedAt}.`,
        detectedAt,
        failedChecks: names,
        evidence,
      },
    ];
  }

  if (names.includes("add_to_cart") || names.includes("checkout")) {
    const which = names.includes("add_to_cart") ? "add to cart" : "checkout";
    return [
      {
        store: result.store,
        dedupeKey: `${result.key}:checkout`,
        severity: "checkout_broken",
        slack: true,
        title: `${result.store} cannot take orders (${which} broken)`,
        firstLine: `${result.store} cannot take orders: ${which} is broken. First seen by this job at ${detectedAt}. ${detailOf(which === "add to cart" ? "add_to_cart" : "checkout")}`,
        detectedAt,
        failedChecks: names,
        evidence,
      },
    ];
  }

  // Anything left is degraded: real, worth a ticket, not worth waking anyone.
  return failed.map((c) => ({
    store: result.store,
    dedupeKey: `${result.key}:${c.name}`,
    severity: "degraded" as Severity,
    slack: false,
    title: `${result.store}: ${c.name} check failing`,
    firstLine: `${result.store} ${c.name} is failing. First seen by this job at ${detectedAt}. ${c.detail}`,
    detectedAt,
    failedChecks: [c.name],
    evidence: c.evidence ? [c.evidence] : [],
  }));
}

/**
 * Decide what the whole run means, across every store it probed.
 *
 * The runbook routes on this: exit 1 sends an agent to file a ticket against the
 * store, exit 3 sends it to fix this script. Conflating them points a
 * client-facing ticket at a store that is healthy, which is what happened on the
 * 2026-10-13T12:23Z run when Playwright closed mid-probe.
 *
 * A real store failure outranks a harness crash: if one store is down and the
 * probe died on the other, the outage still has to surface. A browser that died
 * on store B says nothing about what we saw on store A.
 *
 * A dead resolver is the one exception, and it outranks everything. Every check
 * in this job — DNS, TLS, fetch, Playwright — begins by turning a hostname into
 * an address, so if this machine cannot resolve names then no failure in the run
 * is evidence of anything. On 2026-10-21T15:11Z the host's only nameserver went
 * away mid-run and the job reported thepurplehaze.com DOWN and raw-kratom.com
 * unable to take orders, with Slack pages for both, while both stores were
 * serving 200s the whole time (LAC-5278). Exit 3 points the next agent at the
 * resolver and files nothing against the stores.
 */
export function verdictFor(results: StoreResult[]): Verdict {
  const checks = results.flatMap((r) => r.checks);
  const failed = checks.filter((c) => c.status === "fail");
  if (failed.some((c) => c.name === RESOLVER_CHECK)) return "harness_error";
  if (failed.some((c) => !INFRA_CHECKS.has(c.name))) return "incident";
  if (failed.length) return "harness_error";
  return checks.some((c) => c.status === "adapt") ? "needs_adaptation" : "clean";
}

export function exitCodeFor(verdict: Verdict): number {
  return { clean: 0, incident: 1, needs_adaptation: 2, harness_error: 3 }[verdict];
}

/**
 * Close a browser context or browser without letting teardown sink the run.
 * Playwright throws here when the target is already gone, which is a cleanup
 * detail and never a finding about the store.
 */
export async function closeQuietly(closable: { close: () => Promise<void> }): Promise<void> {
  try {
    await closable.close();
  } catch {
    // Nothing actionable: the evidence is already written.
  }
}

const ok = (name: string, detail: string, httpCode?: number, evidence?: string): Check => ({
  name,
  status: "pass",
  detail,
  httpCode,
  evidence,
});
const bad = (name: string, detail: string, httpCode?: number, evidence?: string): Check => ({
  name,
  status: "fail",
  detail,
  httpCode,
  evidence,
});
const adapt = (name: string, detail: string, evidence?: string): Check => ({
  name,
  status: "adapt",
  detail,
  evidence,
});

/**
 * Playwright errors are a one-line finding followed by a long "Call log:" dump.
 * Keep the finding, drop the dump: the full text goes nowhere useful in a report
 * and the first line is the part that names what timed out.
 *
 * The first line also carries an API-call prefix that arrives mangled under Bun
 * ("for: Timeout 25000ms exceeded." for a locator.waitFor), so drop it. The
 * caller already says which step it was, in words a reader can act on.
 */
export function briefError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const line = (message.split("\n")[0] ?? "").trim();
  return line.replace(/^[\w.]+:\s+/, "").slice(0, 160);
}

/** Which step of the add-to-cart interaction gave up. */
export type AddToCartStage = "locate" | "click";

export interface AddToCartOutcome {
  added: boolean;
  stage: AddToCartStage;
  /** First line of the Playwright error. Empty when the item went in. */
  error: string;
}

/** The slice of a Playwright Locator this interaction needs, so it can be faked. */
interface AddToCartTarget {
  waitFor(options: { state: "visible"; timeout: number }): Promise<void>;
  scrollIntoViewIfNeeded(options: { timeout: number }): Promise<void>;
  click(options: { timeout: number }): Promise<void>;
}

/**
 * Add the item, and keep the two failure modes apart.
 *
 * "The control never appeared" and "the control was there but the click timed
 * out" need different responses, so the caller is told which one happened
 * (LAC-4597). A timed-out click is usually an overlay swallowing the pointer
 * event rather than anything about the store, so it gets one retry after the
 * caller re-clears overlays. A single flake used to cost a full agent wake.
 *
 * The retry can in principle add the item twice, if a click landed and then the
 * page detached before Playwright saw it resolve. That is harmless here: the
 * cart is a throwaway session, the cart check only asserts the line item exists,
 * and the probe never submits an order.
 */
export async function clickAddToCart(
  target: AddToCartTarget,
  label: string,
  notes: string[],
  settle: () => Promise<void>
): Promise<AddToCartOutcome> {
  try {
    // The control is rendered by the theme bundle, so it is absent at
    // domcontentloaded. Wait for it rather than racing it.
    await target.waitFor({ state: "visible", timeout: ATC_VISIBLE_TIMEOUT });
  } catch (error) {
    const brief = briefError(error);
    notes.push(`${label}: no add-to-cart control became visible (${brief})`);
    return { added: false, stage: "locate", error: brief };
  }

  let last = "";
  for (let attempt = 1; attempt <= 2; attempt++) {
    if (attempt > 1) await settle();
    try {
      await target.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
      await target.click({ timeout: ATC_CLICK_TIMEOUT });
      if (attempt > 1) notes.push(`${label}: add-to-cart click landed on retry`);
      return { added: true, stage: "click", error: "" };
    } catch (error) {
      last = briefError(error);
      notes.push(`${label}: add-to-cart click failed (attempt ${attempt} of 2: ${last})`);
    }
  }
  return { added: false, stage: "click", error: last };
}

/**
 * Say which add-to-cart failure happened, and quote the error that proves it.
 *
 * The old single message asserted the template had changed whatever the cause,
 * which sent the next agent hunting for a renamed control that was never
 * renamed (2026-10-16 20:03Z run on thepurplehaze.com).
 */
export function addToCartAdaptDetail(outcome: AddToCartOutcome, productUrl: string): string {
  if (outcome.stage === "locate") {
    return [
      `No add-to-cart control matched on ${productUrl} within ${ATC_VISIBLE_TIMEOUT / 1000}s.`,
      "The product template likely changed; locate the new control and record it in the runbook notes.",
      `Playwright: ${outcome.error}`,
    ].join(" ");
  }
  return [
    `The add-to-cart control on ${productUrl} was found and visible, but two clicks timed out.`,
    "This is not a template change. Look for an overlay eating the pointer event (the age gate re-shows)",
    "or a theme bundle that loaded late, and re-run the job before adapting anything.",
    "The product screenshot in this run's evidence shows the page as the click saw it.",
    `Playwright: ${outcome.error}`,
  ].join(" ");
}

/**
 * Resolve apex A records. The raw-kratom outage was exactly this going empty.
 *
 * Uses dns.resolve4 (c-ares) rather than getaddrinfo on purpose: it reports the
 * precise failure code, so "the name is gone" can be told apart from "our
 * nameserver is not answering". getaddrinfo collapses both to ENOTFOUND on
 * macOS, which is how a resolver outage used to read as a store outage.
 */
async function checkDns(spec: StoreSpec): Promise<Check> {
  const host = new URL(spec.base).hostname;
  try {
    const addrs = await dns.resolve4(host);
    if (!addrs.length) return bad("dns", `${host} resolved to zero A records`);
    return ok("dns", `${host} -> ${addrs.join(", ")}`);
  } catch (error) {
    const message = (error as Error).message;
    if (isResolverFault(error)) {
      return bad(
        RESOLVER_CHECK,
        `this machine's DNS resolver did not answer for ${host} (${message}). ` +
          `Store state is UNKNOWN, not down. Check the host's nameservers (scutil --dns) first.`
      );
    }
    return bad("dns", `${host} did not resolve: ${message}`);
  }
}

/** Read the leaf certificate's notAfter directly off the TLS socket. */
async function checkTls(spec: StoreSpec): Promise<Check> {
  const host = new URL(spec.base).hostname;
  return new Promise((resolve) => {
    const socket = tls.connect({ host, port: 443, servername: host, timeout: 20_000 }, () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.valid_to) {
        resolve(bad("tls", `${host} presented no readable certificate`));
        return;
      }
      const days = Math.floor((new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000);
      const detail = `expires ${cert.valid_to} (${days}d), issuer ${cert.issuer?.O ?? "unknown"}`;
      resolve(days < TLS_MIN_DAYS ? bad("tls", detail) : ok("tls", detail));
    });
    socket.on("timeout", () => {
      socket.destroy();
      resolve(bad("tls", `${host} TLS handshake timed out`));
    });
    socket.on("error", (error) => resolve(bad("tls", `${host} TLS error: ${error.message}`)));
  });
}

async function checkHomepage(spec: StoreSpec): Promise<Check> {
  try {
    const res = await fetch(spec.base, { redirect: "follow", signal: AbortSignal.timeout(30_000) });
    const detail = `GET ${spec.base} -> ${res.status}`;
    return res.ok ? ok("homepage", detail, res.status) : bad("homepage", detail, res.status);
  } catch (error) {
    return bad("homepage", `GET ${spec.base} failed: ${(error as Error).message}`);
  }
}

/**
 * Both stores sell age-restricted products and open with a modal age gate that
 * swallows pointer events. A real buyer clicks through it, so the probe does too.
 * Matched by dialog role and button wording rather than the themes' ad-hoc ids,
 * so a re-skin does not break it.
 */
async function dismissAgeGate(page: Page, label: string, notes: string[]): Promise<void> {
  const dialog = page.locator('[role="dialog"][aria-modal="true"]').first();
  try {
    await dialog.waitFor({ state: "visible", timeout: 8_000 });
  } catch {
    return; // No gate shown (already acknowledged this context, or none exists).
  }
  const confirm = dialog
    .getByRole("button")
    .filter({ hasText: /yes|21\s*\+|18\s*\+|i am|over \d|enter|agree|confirm/i })
    .filter({ hasNotText: /^\s*no\b|not old|under \d/i })
    .first();
  try {
    await confirm.click({ timeout: 10_000 });
    await dialog.waitFor({ state: "hidden", timeout: 10_000 });
  } catch (error) {
    notes.push(
      `${label}: age gate present but no affirmative control matched (${(error as Error).message.slice(0, 90)})`
    );
  }
}

/** Clear the cookie-consent bar, which otherwise intercepts clicks near the footer. */
async function dismissCookieBanner(page: Page): Promise<void> {
  await page
    .getByRole("button", { name: /^(accept|accept all|got it|i agree)$/i })
    .first()
    .click({ timeout: 5_000 })
    .catch(() => {});
  await page.waitForTimeout(500);
}

/**
 * Confirm a new customer can actually start registering.
 *
 * This deliberately does NOT require a password field. Shopify's new customer
 * accounts are passwordless — /account/register redirects to a hosted
 * shopify.com auth page whose only input is an email address. Demanding a
 * password input there reports a false outage on every run.
 */
async function checkSignup(spec: StoreSpec, page: Page, outDir: string): Promise<Check> {
  const url = `${spec.base}${spec.signupPath}`;
  try {
    const res = await page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT });
    const code = res?.status() ?? 0;
    await page.waitForTimeout(3_000);
    // A 200 proves nothing on storefronts that serve a soft-404, so require a
    // real credential input: a password field (classic) or an email field on
    // the account/auth flow (passwordless).
    const passwords = await page.locator('form input[type="password"]:visible').count();
    const emails = await page.locator('form input[type="email"]:visible').count();
    const landed = page.url();
    const onAuthFlow = /account|auth|login|register|customer/i.test(landed);
    const shot = path.join(outDir, `${spec.key}-signup.png`);
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    const detail = `GET ${url} -> ${code}, landed ${landed.slice(0, 80)}, password=${passwords} email=${emails}`;
    return code === 200 && onAuthFlow && (passwords > 0 || emails > 0)
      ? ok("signup_form", detail, code, shot)
      : bad("signup_form", detail, code, shot);
  } catch (error) {
    return bad("signup_form", `${url} failed: ${(error as Error).message}`);
  }
}

/**
 * Choose a value for every required product option (BigCommerce "Strength",
 * "Flavor", and friends). Without this the Add to Cart click is accepted by the
 * page but silently adds nothing, which reads as a broken cart when the store is
 * in fact healthy. Themes hide the real radio behind a styled label, so check
 * with force and let the theme's change handler run.
 */
async function selectProductOptions(page: Page, label: string, notes: string[]): Promise<void> {
  const groups = page.locator("[data-product-attribute]");
  const count = await groups.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const group = groups.nth(i);
    try {
      const radios = group.locator('input[type="radio"]:not([disabled])');
      if (await radios.count()) {
        // The real input is visually hidden, so check() reports "clicking the
        // checkbox did not change its state". Click the styled <label> the
        // buyer actually sees, which is what the theme listens to.
        const id = await radios.first().getAttribute("id");
        if (id) {
          await page.locator(`label[for="${id}"]`).first().click({ timeout: 8_000 });
        } else {
          await radios.first().check({ force: true, timeout: 8_000 });
        }
        await page.waitForTimeout(800);
        continue;
      }
      const select = group.locator("select");
      if (await select.count()) {
        const values = await select
          .first()
          .locator("option")
          .evaluateAll((os) =>
            os
              .filter((o) => !(o as HTMLOptionElement).disabled && (o as HTMLOptionElement).value)
              .map((o) => (o as HTMLOptionElement).value)
          );
        const [firstValue] = values;
        if (firstValue) {
          await select.first().selectOption(firstValue, { timeout: 8_000 });
          await page.waitForTimeout(600);
        }
      }
    } catch (error) {
      notes.push(
        `${label}: could not set product option group ${i} (${(error as Error).message.slice(0, 80)})`
      );
    }
  }
}

/** Discover a purchasable product URL from the platform's own index. */
async function discoverProduct(spec: StoreSpec): Promise<string | null> {
  const timeout = AbortSignal.timeout(30_000);
  if (spec.platform === "shopify") {
    const res = await fetch(`${spec.base}/products.json?limit=25`, { signal: timeout });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      products?: { handle: string; variants?: { available?: boolean }[] }[];
    };
    const hit = body.products?.find((p) => p.variants?.some((v) => v.available));
    return hit ? `${spec.base}/products/${hit.handle}` : null;
  }
  const res = await fetch(`${spec.base}/xmlsitemap.php?type=products&page=1`, { signal: timeout });
  if (!res.ok) return null;
  const xml = await res.text();
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .flatMap((m) => (m[1] ? [m[1].replace(/&amp;/g, "&")] : []))
    .filter((u) => u.includes("/products/"));
  return urls[0] ?? null;
}

/**
 * Walk product -> add to cart -> cart -> checkout, capturing a screenshot at the
 * cart and checkout steps. Stops at the checkout page; never submits.
 */
async function walkPurchasePath(
  spec: StoreSpec,
  page: Page,
  outDir: string,
  notes: string[]
): Promise<Check[]> {
  const checks: Check[] = [];

  const productUrl = await discoverProduct(spec).catch(() => null);
  if (!productUrl) {
    checks.push(
      adapt(
        "product_page",
        `Could not discover a product from the ${spec.platform} index. Find a product another way and record the new route in the runbook notes.`
      )
    );
    return checks;
  }

  let res = await page
    .goto(productUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
    .catch(() => null);
  let code = res?.status() ?? 0;
  if (code !== 200) {
    checks.push(bad("product_page", `GET ${productUrl} -> ${code}`, code));
    return checks;
  }
  checks.push(ok("product_page", `GET ${productUrl} -> ${code}`, code));

  await dismissAgeGate(page, spec.label, notes);
  await dismissCookieBanner(page);
  await selectProductOptions(page, spec.label, notes);

  // Match on the accessible name, not theme CSS classes. This resolves both
  // Shopify's <button>Add to cart</button> and BigCommerce's
  // <input type="submit" value="Add to Cart">, whose name comes from @value and
  // which therefore has no text node to match on.
  const addToCart = page.getByRole("button", { name: /add to cart|add to bag/i }).first();

  const outcome = await clickAddToCart(addToCart, spec.label, notes, async () => {
    // The age gate re-shows and covers the button, which is the likeliest reason
    // a click on a visible control times out. Clear it, then let the theme settle.
    await dismissAgeGate(page, spec.label, notes);
    await dismissCookieBanner(page);
    await page.waitForTimeout(2_000);
  });
  if (outcome.added) await page.waitForTimeout(5_000);

  if (!outcome.added) {
    // This path used to return before any screenshot, so the one run that needed
    // a picture of the page was the one run that had none (LAC-4597).
    const productShot = path.join(outDir, `${spec.key}-product.png`);
    await page.screenshot({ path: productShot, fullPage: false }).catch(() => {});
    checks.push(adapt("add_to_cart", addToCartAdaptDetail(outcome, productUrl), productShot));
    return checks;
  }

  const cartUrl = spec.platform === "shopify" ? `${spec.base}/cart` : `${spec.base}/cart.php`;
  res = await page
    .goto(cartUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
    .catch(() => null);
  code = res?.status() ?? 0;
  // Clear any re-shown gate so the screenshot is of the cart, not the overlay.
  await dismissAgeGate(page, spec.label, notes);
  const cartShot = path.join(outDir, `${spec.key}-cart.png`);
  await page.screenshot({ path: cartShot, fullPage: false }).catch(() => {});

  // An empty cart page still returns 200, so assert the line item is really there.
  const cartBody = (await page.textContent("body").catch(() => "")) ?? "";
  const cartEmpty = /your cart is (currently )?empty|cart is empty/i.test(cartBody);
  if (code !== 200 || cartEmpty) {
    checks.push(
      bad(
        "add_to_cart",
        `GET ${cartUrl} -> ${code}${cartEmpty ? " but cart reports empty — item did not persist" : ""}`,
        code,
        cartShot
      )
    );
    return checks;
  }
  checks.push(ok("add_to_cart", `item persisted; GET ${cartUrl} -> ${code}`, code, cartShot));

  // Reach the checkout page. Do NOT submit anything from here.
  const checkoutUrl = `${spec.base}/checkout`;
  res = await page
    .goto(checkoutUrl, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT })
    .catch(() => null);
  code = res?.status() ?? 0;
  await page.waitForTimeout(5_000);
  await dismissAgeGate(page, spec.label, notes);
  const checkoutShot = path.join(outDir, `${spec.key}-checkout.png`);
  await page.screenshot({ path: checkoutShot, fullPage: false }).catch(() => {});

  const landed = page.url();
  const checkoutBody = (await page.textContent("body").catch(() => "")) ?? "";
  // Checkout must actually render a payment/contact step. Being bounced back to
  // the cart or an empty shell is the failure mode that matters to Doug.
  const looksLikeCheckout =
    /email|contact|shipping|payment|billing/i.test(checkoutBody) &&
    !/cart is empty/i.test(checkoutBody);

  if (code !== 200 || !looksLikeCheckout) {
    checks.push(
      bad(
        "checkout",
        `GET ${checkoutUrl} -> ${code}, landed ${landed}, checkout fields detected: ${looksLikeCheckout}`,
        code,
        checkoutShot
      )
    );
    return checks;
  }
  checks.push(ok("checkout", `reached ${landed} -> ${code} (not submitted)`, code, checkoutShot));
  return checks;
}

/**
 * Launch Chromium, tolerating a Playwright browser cache that does not match the
 * installed Playwright version. The cache is shared across every repo on the BAS
 * host, so the exact pinned build is often absent while a perfectly usable
 * neighbouring build is present. Honour PLAYWRIGHT_CHROMIUM_PATH first.
 */
async function launchBrowser(): Promise<Browser> {
  const override = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (override) return chromium.launch({ headless: true, executablePath: override });

  try {
    return await chromium.launch({ headless: true });
  } catch (error) {
    const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
    const entries = await readdir(cache).catch(() => [] as string[]);
    const candidates = entries
      .filter((e) => e.startsWith("chromium_headless_shell-") || e.startsWith("chromium-"))
      .sort((a, b) => Number(b.split("-").pop() ?? 0) - Number(a.split("-").pop() ?? 0))
      .flatMap((e) => [
        path.join(cache, e, "chrome-headless-shell-mac-arm64/chrome-headless-shell"),
        path.join(cache, e, "chrome-mac/Chromium.app/Contents/MacOS/Chromium"),
      ]);

    for (const executablePath of candidates) {
      if (
        await access(executablePath).then(
          () => true,
          () => false
        )
      ) {
        console.warn(`playwright: pinned build missing, falling back to ${executablePath}`);
        return chromium.launch({ headless: true, executablePath });
      }
    }
    throw error;
  }
}

async function runStore(spec: StoreSpec, browser: Browser, outDir: string): Promise<StoreResult> {
  const notes: string[] = [];
  const checks: Check[] = [];

  checks.push(await checkDns(spec));
  checks.push(await checkTls(spec));
  checks.push(await checkHomepage(spec));

  // A fresh context per store keeps carts isolated and leaves no stored state.
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36 BAS-StoreWatch/1.0 (read-only monitoring)",
    viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);

  try {
    checks.push(...(await walkPurchasePath(spec, page, outDir, notes)));
    checks.push(await checkSignup(spec, page, outDir));
  } finally {
    // Best-effort: by now every check has run and every screenshot is on disk,
    // so a failure tearing the context down must not throw away the run. It did
    // on 2026-10-13T12:23Z, which cost us all seven thepurplehaze results.
    await closeQuietly(context);
  }

  return {
    key: spec.key,
    store: spec.label,
    base: spec.base,
    platform: spec.platform,
    checks,
    notes,
  };
}

/**
 * Before calling a store broken, prove this machine could still resolve names.
 *
 * A pass on the DNS check at the top of a run does not cover this: the answer
 * can come from cache and the resolver can die seconds later, which is precisely
 * the 2026-10-21T15:11Z run — raw-kratom.com resolved, its cart loaded, and then
 * the nameserver went away, so the checkout navigation landed on
 * chrome-error://chromewebdata/ and got filed as "cannot take orders".
 *
 * Only runs when something already failed, so a clean run pays nothing for it.
 * A genuine NXDOMAIN is not a resolver fault and still reaches the ticket
 * stream, so this cannot hide the outage the job was built for.
 */
export async function resolverFaultResult(specs: StoreSpec[]): Promise<StoreResult | null> {
  const checks = await Promise.all(specs.map((spec) => checkDns(spec)));
  const fault = checks.find((c) => c.name === RESOLVER_CHECK && c.status === "fail");
  if (!fault) return null;
  return {
    key: "host",
    store: "monitoring host",
    base: "",
    platform: "host",
    checks: [fault],
    notes: ["Re-probed after a failing check; the resolver was gone by the end of the run."],
  };
}

/**
 * Enforce retention. Nothing else does, so without this the evidence directory
 * grows without bound and "keep it 30 days" means "keep it forever".
 */
async function pruneExpiredRuns(base: string, nowMs: number): Promise<string[]> {
  const names = await readdir(base).catch(() => [] as string[]);
  const runs: { name: string; mtimeMs: number }[] = [];
  for (const name of names) {
    const info = await stat(path.join(base, name)).catch(() => null);
    if (info?.isDirectory()) runs.push({ name, mtimeMs: info.mtimeMs });
  }
  const expired = expiredRuns(runs, nowMs);
  for (const name of expired) {
    await rm(path.join(base, name), { recursive: true, force: true }).catch(() => {});
  }
  return expired;
}

async function main() {
  const argv = process.argv.slice(2);
  const arg = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };

  const startedAt = new Date();
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const evidenceBase = await evidenceBaseFor(repoRoot);
  const explicitOut = arg("--out");
  const outDir = explicitOut
    ? path.resolve(explicitOut)
    : path.join(evidenceBase, startedAt.toISOString().replace(/[:.]/g, "-"));
  await mkdir(outDir, { recursive: true });

  // Before the run, so retention holds even if this run dies half way through.
  const pruned = await pruneExpiredRuns(evidenceBase, startedAt.getTime());
  if (pruned.length) console.log(`Pruned ${pruned.length} run(s) older than ${RETENTION_DAYS}d`);

  // --store / --base exist so the runbook's forced-failure drill can point the
  // job at a known-bad host and prove it files exactly one correct ticket.
  const only = arg("--store");
  const baseOverride = arg("--base");
  let specs = only ? STORES.filter((s) => s.key === only) : STORES;
  if (!specs.length) {
    console.error(`Unknown --store ${only}. Known: ${STORES.map((s) => s.key).join(", ")}`);
    process.exit(3);
  }
  if (baseOverride)
    specs = specs.map((s) => ({ ...s, base: baseOverride, label: new URL(baseOverride).hostname }));

  const browser = await launchBrowser();
  const results: StoreResult[] = [];
  try {
    for (const spec of specs) {
      console.log(`\n=== ${spec.label} (${spec.platform}) ===`);
      const result = await runStore(spec, browser, outDir).catch(
        (error): StoreResult => ({
          key: spec.key,
          store: spec.label,
          base: spec.base,
          platform: spec.platform,
          checks: [bad(HARNESS_CHECK, `probe threw: ${(error as Error).message}`)],
          notes: [],
        })
      );
      for (const c of result.checks) {
        const mark = c.status === "pass" ? "PASS" : c.status === "fail" ? "FAIL" : "ADAPT";
        console.log(`  [${mark}] ${c.name}: ${c.detail}`);
      }
      results.push(result);
    }
  } finally {
    // Same reason as the per-store context: this runs before report.json is
    // written, so a throw here would lose the evidence for every store.
    await closeQuietly(browser);
  }

  const detectedAt = startedAt.toISOString();

  // Anything that failed is only a finding if the host could still resolve names.
  if (results.some((r) => r.checks.some((c) => c.status === "fail"))) {
    const fault = await resolverFaultResult(specs);
    if (fault) {
      console.log(`\n=== ${fault.store} ===`);
      console.log(`  [FAIL] ${fault.checks[0]?.name}: ${fault.checks[0]?.detail}`);
      results.push(fault);
    }
  }

  const verdict = verdictFor(results);
  // A voided run has nothing to file: see verdictFor. Computing the tickets and
  // then declining to print them would still leave them in report.json, where
  // the next agent would find them and file them anyway.
  const incidents =
    verdict === "harness_error" ? [] : results.flatMap((r) => toIncidents(r, detectedAt));
  const adaptations = results.flatMap((r) =>
    r.checks.filter((c) => c.status === "adapt").map((c) => ({ store: r.store, ...c }))
  );

  const report = {
    job: "doug-store-watch",
    issue: "LAC-4280",
    verdict,
    startedAt: detectedAt,
    finishedAt: new Date().toISOString(),
    outDir,
    retentionDays: RETENTION_DAYS,
    prunedRuns: pruned,
    results,
    // File exactly one ticket per entry here, deduped on dedupeKey.
    incidents,
    // What the run would have filed if the resolver had held up. Diagnostic
    // only: these are unproven in both directions. Never file from this key.
    unprovenFindings:
      verdict === "harness_error" ? results.flatMap((r) => toIncidents(r, detectedAt)) : [],
    adaptations,
  };
  const reportPath = path.join(outDir, "report.json");
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (incidents.length) {
    console.log(`\nTICKETS TO FILE: ${incidents.length}`);
    for (const i of incidents) {
      console.log(`  [${i.severity}${i.slack ? " +slack" : ""}] ${i.dedupeKey}: ${i.firstLine}`);
    }
  }
  if (verdict === "harness_error") {
    const resolverDown = results.some((r) =>
      r.checks.some((c) => c.name === RESOLVER_CHECK && c.status === "fail")
    );
    console.log("\nHARNESS ERROR — this is our side, not a store outage.");
    console.log("Fix the harness and re-run. Do NOT file a ticket against the store.");
    for (const r of results) {
      for (const c of r.checks.filter((c) => INFRA_CHECKS.has(c.name) && c.status === "fail")) {
        console.log(`  ${r.store}: ${c.detail}`);
      }
    }
    if (resolverDown) {
      // Say this out loud. The stores were never checked, and a silent exit 3
      // reads too much like the silence that means "clean".
      const suppressed = results.flatMap((r) => toIncidents(r, detectedAt));
      console.log("\nSTORE HEALTH WAS NOT VERIFIED THIS RUN. The resolver went away mid-run,");
      console.log("so every check below it is unproven in both directions.");
      if (suppressed.length) {
        console.log(`Suppressed ${suppressed.length} unproven finding(s), NOT to be filed:`);
        for (const i of suppressed) console.log(`  ${i.dedupeKey}: ${i.firstLine}`);
      }
      console.log("Restore DNS on this host, then re-run this job to get a real verdict.");
    }
  }
  console.log(`\nVERDICT: ${verdict}`);
  console.log(`Evidence: ${reportPath}`);
  process.exit(exitCodeFor(verdict));
}

// Guarded so the pure helpers above can be imported by tests without launching
// a browser and hitting the live stores.
if (import.meta.main) {
  main().catch((error) => {
    console.error("harness error:", error);
    process.exit(3);
  });
}
