# Doug store watch

Monitoring job for Doug's two stores. Runs twice daily (08:00 and 20:00 ET).
Read-only.

This file is the whole job. Run it unchanged; whatever difference shows up
between runs is the stores, not the brief.

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

Twice daily, at 08:00 and 20:00 ET. If a run overlaps the previous one, skip it
rather than stacking. Cut from every 4h on 2026-10-19 (LAC-4913): the 4h cadence
existed for a parallel trial that is now cancelled, and it was already missing
slots silently, so a stated 12h gap is more honest than an unannounced 15h one.

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
- **A single Add to Cart click can time out on a button that is right there.**
  The age gate re-shows over it, or the theme bundle lands late. The job clicks
  twice with the gate re-cleared in between, and only gives up after both. One
  run reporting this is a flake, not a store change. See "Two different
  add_to_cart failures" below.

## Evidence

A run is judged on its evidence, not on the agent's summary. Every run saves:

- The **HTTP status code** for each navigation (checks 3 through 7).
- A **screenshot of the cart page and of the checkout page**, per store.
- A **screenshot of the product page** whenever Add to Cart gives up, per store.
  The run that cannot add the item is the run someone needs a picture of.
- The product URL actually used.
- A machine-readable report of every check with pass/fail and detail.

A screenshot showing the age gate, an empty cart, or a cart with no line item
does not support a "checkout works" claim. If the screenshot and the summary
disagree, the screenshot wins.

Keep the evidence for at least 30 days so a slow regression can be traced back.
Evidence that does not outlive the run is not evidence: if the job runs inside a
temporary checkout, a container, or anything else that gets thrown away, write
it somewhere that survives.

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

### Two different add_to_cart failures

`add_to_cart` reaches exit 2 for two unrelated reasons. Read which one the
report names before you go looking for a renamed control.

| Report says | What happened | What to do |
|---|---|---|
| "No add-to-cart control matched on ... within 25s" | The control never became visible. | This is the layout change. Find the new control, record it in Notes. |
| "was found and visible, but two clicks timed out" | The control is there. Two clicks did not land, with the age gate re-cleared between them. | Nothing changed on the store. Re-run the job. Open `<store>-product.png` in the run's evidence to see what was covering the button. |

Both quote the Playwright error that ended the attempt. The product screenshot
is saved either way.

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
| Blind | No run has landed in 5h | Slack DM only, once per gap |

## Running it on the BAS server

The BAS implementation is `scripts/doug-store-watch.ts` in this repo:

```bash
bun scripts/doug-store-watch.ts
```

Exit codes: `0` clean, `1` incident, `2` needs a human or agent to adapt, `3`
harness error.

Exit `3` also covers the monitoring host losing DNS, and that case voids the
whole run: no store ticket is filed, because nothing the run saw is evidence
either way. The output says `STORE HEALTH WAS NOT VERIFIED THIS RUN` and lists
what it would have filed under `unprovenFindings` in `report.json`. **Never file
from that key.** Fix DNS on the host, then re-run to get a real verdict.

Evidence lands in `store-watch-runs/<timestamp>/` as `report.json` plus the
screenshots. That path is resolved against the **main checkout**, not the
working directory, because an agent woken on this job runs inside a disposable
git worktree (`.paperclip/worktrees/<issue>/`) and evidence written there dies
with the worktree (LAC-4300). Pass `--out <dir>` to override; an explicit
`--out` is used as given.

Each run prunes evidence older than 30 days, so the directory stays bounded
without anyone tending it.

To rehearse the failure path without breaking anything, point it at a host that
does not exist:

```bash
bun scripts/doug-store-watch.ts --store raw-kratom --base https://store-watch-drill.raw-kratom.com
```

Any runner of this file may use its own tooling. The checks, the evidence
standard, and the output rules are what must match.

## Watching the watch

Silence is the success signal, which means a run that never starts looks
exactly like a clean one. On 2026-10-13 the 04:00 ET slot never executed: no
evidence directory, no exit code, no message. Doug's stores were unwatched for
four hours and the only way anyone found out was by counting directories
afterwards (LAC-4335, and the missed run itself was LAC-4326).

So a second, much smaller job watches the first one:

```bash
bun scripts/doug-store-watch-freshness.ts [--notify] [--max-age-hours N] [--evidence <dir>]
```

It reads the newest `store-watch-runs/<ts>/report.json` and compares its
`startedAt` to now. Under 13 hours, it prints nothing and exits 0. Over 13
hours, or if no run has ever been recorded, it prints one line and exits 1.
Thirteen hours is one full 12h gap between the two daily slots plus an hour of
slack, so a run that merely started late does not wake anyone. Change the
cadence and this threshold moves with it: longest gap between slots, plus 1h.

Exit codes: `0` the watch is running, `1` the watch is blind, `2` bad usage. A
typo in the schedule exits 2 rather than 1, so it cannot sit in the log looking
like a real blind window.

Two things make it a real check rather than another thing that can go dark with
everything else:

- **It is not scheduled by Paperclip.** The Paperclip runner is what failed, so
  a check it schedules inherits the failure. The operating system schedules this
  one.
- **It shares no dependency with the watch.** No Playwright, no browser, no
  network, no database. One JSON file and the clock.

A run directory with no `report.json` does not count as a run. That is a run
that died before producing evidence, which is the condition being alerted on.

With `--notify` it Slack-DMs the line, at most once per gap. The key is pinned
to the last good run, so it does not move while a gap lasts and does move once
a run lands and a later gap opens. An hourly check without that turns a two-day
outage into forty-eight identical messages, and the next real one gets ignored.
If Slack itself fails, the line still goes to stdout, the exit code is still 1,
and the gap keeps its unsent alert for the next hour.

Credentials come from the environment, not from a path on Lacy's laptop, so any
host runs the same file:

| Variable | Value |
|---|---|
| `STORE_WATCH_SLACK_TOKEN` | clawdbot bot token (`~/.openclaw/openclaw.json`, `.channels.slack.botToken`) |
| `STORE_WATCH_SLACK_CHANNEL` | `U3XC80UUQ` (DMs Lacy) |

### What is scheduled, and where

On the BAS Mac it is a launchd agent, hourly at :20, so a run that started on
the hour has time to write its evidence first:

```
~/Library/LaunchAgents/com.buildandserve.store-watch-freshness.plist
launchctl bootstrap gui/$UID ~/Library/LaunchAgents/com.buildandserve.store-watch-freshness.plist
launchctl print gui/$UID/com.buildandserve.store-watch-freshness   # state, run count, last exit
tail /tmp/store-watch-freshness.log
```

launchd rather than cron because editing the cron spool on macOS needs Full
Disk Access, which an agent session cannot grant itself. launchd also runs the
job on wake, so a gap that opens while the Mac is asleep is caught when it comes
back rather than at the next whole hour.

On a Linux box (the Hetzner move, LAC-4279) the same thing is one cron line:

```cron
20 * * * * cd /path/to/buildandserve && STORE_WATCH_SLACK_TOKEN=... STORE_WATCH_SLACK_CHANNEL=... bun scripts/doug-store-watch-freshness.ts --notify >> /tmp/store-watch-freshness.log 2>&1
```

Worst case detection is about six hours after the last good run, roughly two
hours into a missed slot.

One thing this does not cover: if the script itself goes missing, `bun` fails to
load it and exits before any of the above runs, so the failure lands in
`/tmp/store-watch-freshness.log` and nobody is DMed. The script is in this repo
and under test, so the realistic way that happens is someone deleting it on
purpose.

To rehearse it without waiting for a real gap, point it at a directory holding
one old report:

```bash
bun scripts/doug-store-watch-freshness.ts --evidence /tmp/drill/store-watch-runs
```

## Notes

Running log of what changed on the stores, newest first. Each run that adapts
appends a line here.

- **2026-10-21** Neither store changed. The **monitoring host** lost DNS: its
  only nameserver (`10.0.0.243`) stopped answering mid-run at ~15:12Z. The 15:11Z
  run reported thepurplehaze.com **DOWN** and raw-kratom.com **unable to take
  orders**, with a Slack page on both, and both were false. Checked by hand
  against public resolvers at the time: thepurplehaze.com resolves to
  23.227.38.32 and served 200 on `/` and `/cart`; raw-kratom.com resolves to
  192.200.160.14 and served 200 on `/` and `/cart.php`, and `/checkout` served
  the checkout asset chain and correctly 302'd an empty cart to `/cart.php`. The
  15:25Z run, with the resolver still dead, passed thepurplehaze's full purchase
  path through to a real Shopify checkout URL. **A "store is down" finding from
  this job is only as trustworthy as the host's resolver — check `scutil --dns`
  and `dig @1.1.1.1 <host>` before you believe it.** Fixed in LAC-5278: an
  unanswered DNS query (`ETIMEOUT` and friends) is now a `resolver` check, not a
  `dns` check, which voids the entire run as exit 3 and files nothing. An
  authoritative `ENOTFOUND`/`ENODATA` is still a real outage and still files, so
  the LACA-1909 case is unaffected. A failing run also re-probes the resolver at
  the end, because the first DNS check can pass from cache and the nameserver
  can die seconds later, which is exactly what happened to raw-kratom here.
- **2026-10-16** thepurplehaze.com returned `needs_adaptation` on add_to_cart at
  20:03Z and nothing had changed on the store. The 16:14Z run before it and the
  21:21Z run after it both added the same product
  (`/products/top-shelf-pre-roll-5-pack-0-5g-each`) and reached checkout. The
  control was found and visible; it was the *click* that timed out at 20s, so
  the "No add-to-cart control matched" wording in that report was misleading.
  **A lone exit 2 on add_to_cart is not evidence of a layout change. Re-run the
  job first.** If the next run is clean, the store is fine and there is nothing
  to adapt. Fixed in LAC-4597: the job now retries the click once after
  re-dismissing the age gate, names which of the two failures happened, quotes
  the Playwright error, and saves a product-page screenshot before it gives up.
- **2026-10-12** Baseline established. Both stores pass all 7 checks. Known
  shape at this date: both stores show a 21+ age gate on first load;
  raw-kratom products require Strength and Flavor options before Add to Cart
  will do anything; raw-kratom's Add to Cart is an `input[type=submit]`;
  thepurplehaze uses Shopify passwordless accounts, so `/account/register`
  redirects off-domain to `shopify.com/authentication/...` with an email-only
  form. raw-kratom TLS expires 2026-12-21, thepurplehaze 2026-12-12.
