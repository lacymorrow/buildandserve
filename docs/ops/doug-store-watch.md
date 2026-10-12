# Doug store watch

Monitoring job for Doug's two stores. Runs every 4 hours. Read-only.

This file is the whole job. The BAS server and the Managed Agents trial both run
it unchanged, so whatever difference shows up between them is the service, not
the brief.

Ticket: LAC-4280.

## Why this exists

raw-kratom.com was down for two days (LACA-1909, the apex DNS record was gone)
and nobody noticed. Doug should never be the one who tells us his store is
broken.

A homepage ping would not have been enough on its own, and it is not enough now.
The job has to walk the path a paying customer walks and prove it got there.

## The two stores

| Store | Platform | Checkout path |
|---|---|---|
| raw-kratom.com | BigCommerce | `/cart.php`, `/checkout` |
| thepurplehaze.com | Shopify | `/cart`, `/checkout` |

## Hard rules

1. **Read-only.** Browse, add one item to your own throwaway cart, stop at the
   checkout page. Never submit an order. Never place a real order.
2. **Never create an account, post a review, apply a coupon, or change store
   settings.** Confirming the signup form renders is not the same as using it.
3. **Never contact Doug or anyone outside the company** (rule 13). Not by email,
   not by phone, not through a contact form, not through chat. Everything this
   job produces goes to Lacy and nowhere else.
4. **One cart session per run.** Start from a clean browser context so a stale
   cart cannot mask a real failure.
5. **Report what you observed, not what you expect.** If you could not verify a
   step, say so. Do not infer that checkout works because the cart worked.

## Cadence

Every 4 hours. If a run overlaps the previous one, skip it rather than stacking.

## What to check, per store

Run every check even if an earlier one fails, so one ticket can carry the whole
picture. The exception: if DNS or the homepage is down, the purchase path will
obviously fail too, and the ticket should say the store is down rather than
listing every downstream symptom.

| # | Check | Passes when |
|---|---|---|
| 1 | DNS | The apex name resolves to at least one A record |
| 2 | TLS | The leaf certificate is valid for **more than 14 days** |
| 3 | Homepage | `GET /` returns 200 |
| 4 | Product page | A real product page returns 200 |
| 5 | Add to cart | The item is still in the cart after reloading the cart page |
| 6 | Checkout | The checkout page renders contact/shipping/payment fields |
| 7 | Signup form | The account registration flow renders a usable credential field |

### Things that look like failures and are not

These are known-good behaviours of these two stores. Do not file tickets for
them.

- **Both stores open with a 21+ age gate** (`role="dialog"`, "Yes, I'm 21+").
  Click through it. A real buyer does. It also intercepts clicks, so anything
  you try before dismissing it will appear broken.
- **raw-kratom products have required options** ("Strength", "Flavor"). If you
  do not pick one, Add to Cart is accepted by the page and silently adds
  nothing. Pick a value for every required option first.
- **The real radio inputs are hidden behind styled labels.** Click the label,
  not the input.
- **thepurplehaze.com uses Shopify passwordless customer accounts.**
  `/account/register` redirects to a hosted `shopify.com/authentication/...`
  page whose only field is an email address. That is correct. Do not require a
  password field.
- **An empty cart page still returns 200**, and a soft-404 can return 200 too. A
  status code alone never proves a step passed.

## Evidence

A run is judged on its evidence, not on the agent's summary. Every run saves:

- The **HTTP status code** for each navigation (checks 3 through 7).
- A **screenshot of the cart page and of the checkout page**, per store.
- The product URL actually used.
- A machine-readable report of every check with pass/fail and detail.

A screenshot showing the age gate, an empty cart, or a cart with no line item
does not support a "checkout works" claim. If the screenshot and the summary
disagree, the screenshot wins.

Keep the evidence for at least 30 days so a slow regression can be traced back.

## When the store changes shape

Layouts and URLs change. That is expected and is not an incident by itself.

1. **Discover products at runtime**, never from a hardcoded list. Shopify:
   `/products.json`. BigCommerce: `/xmlsitemap.php?type=products&page=1`. This
   way a renamed or sold-out product cannot cause a false alarm.
2. **Match controls by what the buyer sees** (the accessible name, for example
   "Add to cart"), not by theme CSS classes. BigCommerce renders Add to Cart as
   `<input type="submit" value="Add to Cart">`, which has no text node, so match
   on the accessible name rather than the text content.
3. If a control is genuinely gone, **find the product another way** before
   concluding anything is broken: a collection page, search, the sitemap, the
   homepage.
4. **Only after adapting fails** do you treat it as an incident.
5. **Write down what changed in the Notes section at the bottom of this file**,
   with the date, so the next run starts from the new reality instead of
   rediscovering it. This is the part that makes the job cheaper over time.

## What to do with the result

### All good

Do nothing. Send no message. Post no "all clear". Record the run so fleet-health
can read it. Silence is the success signal.

### Something is wrong

File **one ticket per distinct problem** in LAC, assigned to Lacy.

- **The first line is what is broken and since when.** Not a preamble.
- Name the store, the failing check, the HTTP codes, and attach the screenshots.
- Dedupe: before filing, search LAC for an open ticket for the same store and
  the same check. **If one exists, add a comment with the new timestamp. If it
  was closed and the problem is back, reopen it. Never file a second ticket for
  a problem that already has one.**
- Two stores failing the same way at the same time is still two tickets, one per
  store, because they are separate clients' revenue and get fixed separately.

### Slack DM

Slack-DM Lacy **only** for:

- a store that is down (DNS fails, or the homepage does not return 200), or
- checkout broken (cannot add to cart, or the checkout page does not render).

Everything else is ticket-only. TLS expiring in 10 days is a ticket, not a DM at
3am.

The DM is read on a phone, half awake. One line, then the link. No preamble, no
check-by-check breakdown, no screenshots inline:

```
raw-kratom.com is down: DNS does not resolve. First seen 2026-10-12 14:06 ET. LAC-1234
```

That is the whole message. The ticket carries the detail and the evidence.

## Severity

| Severity | Means | Output |
|---|---|---|
| Down | DNS fails, or homepage is not 200 | Ticket + Slack DM |
| Checkout broken | Cannot add to cart, or checkout does not render | Ticket + Slack DM |
| Degraded | Signup form missing, or TLS under 14 days | Ticket only |
| Adapted | Layout changed, job recovered on its own | No ticket. Append to Notes |

## Running it on the BAS server

The BAS implementation is `scripts/doug-store-watch.ts` in this repo:

```bash
bun scripts/doug-store-watch.ts --out ./store-watch-runs/$(date -u +%Y%m%dT%H%M%SZ)
```

Exit codes: `0` clean, `1` incident, `2` needs a human or agent to adapt, `3`
harness error. Evidence lands in the `--out` directory as `report.json` plus the
screenshots.

To rehearse the failure path without breaking anything, point it at a host that
does not exist:

```bash
bun scripts/doug-store-watch.ts --store raw-kratom --base https://store-watch-drill.raw-kratom.com
```

The Managed Agents trial gets this same file and uses its own tooling. The
checks, the evidence standard, and the output rules are what must match.

## Notes

Running log of what changed on the stores, newest first. Each run that adapts
appends a line here.

- **2026-10-12** Baseline established. Both stores pass all 7 checks. Known
  shape at this date: both stores show a 21+ age gate on first load;
  raw-kratom products require Strength and Flavor options before Add to Cart
  will do anything; raw-kratom's Add to Cart is an `input[type=submit]`;
  thepurplehaze uses Shopify passwordless accounts, so `/account/register`
  redirects off-domain to `shopify.com/authentication/...` with an email-only
  form. raw-kratom TLS expires 2026-12-21, thepurplehaze 2026-12-12.
