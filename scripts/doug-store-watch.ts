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
import { access, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath } from "node:url";
import { type Browser, chromium, type Page } from "playwright";

const TLS_MIN_DAYS = 14;
const NAV_TIMEOUT = 45_000;

/** Directory, under the main checkout, that holds one subdirectory per run. */
export const EVIDENCE_DIR_NAME = "store-watch-runs";

/** The runbook's evidence standard: keep runs long enough to trace a regression. */
export const RETENTION_DAYS = 30;

interface StoreSpec {
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
  // A crashed probe is our bug, not Doug's outage. Dropping it here keeps it out
  // of the ticket stream entirely; verdictFor turns it into exit 3 instead.
  const failed = result.checks.filter((c) => c.status === "fail" && c.name !== HARNESS_CHECK);
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
 * probe died on the other, the outage still has to surface.
 */
export function verdictFor(results: StoreResult[]): Verdict {
  const checks = results.flatMap((r) => r.checks);
  if (checks.some((c) => c.status === "fail" && c.name !== HARNESS_CHECK)) return "incident";
  if (checks.some((c) => c.status === "fail" && c.name === HARNESS_CHECK)) return "harness_error";
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
const adapt = (name: string, detail: string): Check => ({ name, status: "adapt", detail });

/** Resolve apex A records. The raw-kratom outage was exactly this going empty. */
async function checkDns(spec: StoreSpec): Promise<Check> {
  const host = new URL(spec.base).hostname;
  try {
    const addrs = await dns.resolve4(host);
    if (!addrs.length) return bad("dns", `${host} resolved to zero A records`);
    return ok("dns", `${host} -> ${addrs.join(", ")}`);
  } catch (error) {
    return bad("dns", `${host} did not resolve: ${(error as Error).message}`);
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

  let added = false;
  try {
    // The control is rendered by the theme bundle, so it is absent at
    // domcontentloaded. Wait for it rather than racing it.
    await addToCart.waitFor({ state: "visible", timeout: 25_000 });
    await addToCart.scrollIntoViewIfNeeded({ timeout: 10_000 }).catch(() => {});
    await addToCart.click({ timeout: 20_000 });
    await page.waitForTimeout(5_000);
    added = true;
  } catch (error) {
    notes.push(
      `${spec.label}: add-to-cart click failed (${(error as Error).message.slice(0, 120)})`
    );
  }

  if (!added) {
    checks.push(
      adapt(
        "add_to_cart",
        `No add-to-cart control matched on ${productUrl}. The product template likely changed; locate the new control and record it in the runbook notes.`
      )
    );
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
 * Where a run's evidence belongs, given the checkout the script was invoked
 * from and the contents of that checkout's `.git` when it is a pointer file.
 *
 * Evidence has to outlive the process that produced it. The default used to be
 * the cwd-relative `./store-watch-runs`, which is correct from the main
 * checkout and wrong everywhere else: Paperclip wakes an agent inside
 * `.paperclip/worktrees/<issue>/`, so screenshots and report.json landed in a
 * directory that is deleted with the worktree and the 30-day retention the
 * runbook promises silently did not happen (LAC-4300). A linked worktree's
 * `.git` is a file pointing at `<main>/.git/worktrees/<name>`, which names the
 * main checkout, so anchor there instead of at the cwd.
 */
export function resolveEvidenceBase(repoRoot: string, gitPointer: string | null): string {
  const gitDir = gitPointer ? /^gitdir:\s*(.+?)\s*$/m.exec(gitPointer)?.[1] : undefined;
  const mainCheckout = gitDir
    ? /^(.*)[/\\]\.git[/\\]worktrees[/\\][^/\\]+$/.exec(gitDir)?.[1]
    : undefined;
  return path.join(mainCheckout ?? repoRoot, EVIDENCE_DIR_NAME);
}

/** Run directories whose evidence has aged past the retention window. */
export function expiredRuns(
  runs: { name: string; mtimeMs: number }[],
  nowMs: number,
  retentionDays: number = RETENTION_DAYS
): string[] {
  const cutoff = nowMs - retentionDays * 86_400_000;
  return runs.filter((run) => run.mtimeMs < cutoff).map((run) => run.name);
}

/** The `.git` of a linked worktree is a file; of a normal checkout, a directory. */
async function readGitPointer(repoRoot: string): Promise<string | null> {
  const dotGit = path.join(repoRoot, ".git");
  try {
    if (!(await stat(dotGit)).isFile()) return null;
    return await readFile(dotGit, "utf8");
  } catch {
    return null;
  }
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
  const evidenceBase = resolveEvidenceBase(repoRoot, await readGitPointer(repoRoot));
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
  const incidents = results.flatMap((r) => toIncidents(r, detectedAt));
  const adaptations = results.flatMap((r) =>
    r.checks.filter((c) => c.status === "adapt").map((c) => ({ store: r.store, ...c }))
  );

  const verdict = verdictFor(results);
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
    console.log("\nHARNESS ERROR — this is this script's bug, not a store outage.");
    console.log("Fix the harness and re-run. Do NOT file a ticket against the store.");
    for (const r of results) {
      for (const c of r.checks.filter((c) => c.name === HARNESS_CHECK && c.status === "fail")) {
        console.log(`  ${r.store}: ${c.detail}`);
      }
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
