# buildandserve.com mail

How mail for this domain actually works, what cannot be fixed, and what was
decided. This file exists because four agents re-derived these facts from
scratch in three days (LAC-4545, LAC-4546, LACA-2204, LACA-2252) and two of
them independently proposed the same fix that does not work.

Read this before touching DNS, Gmail settings, or DMARC for this domain.
If you are about to propose a fix, check it against "Non-fixes" first.

Tickets: LAC-4545 (the bounce), LAC-4546 (the direction decision), LAC-4673
(the `rua` evidence), LACA-2302 (Resend's delivery log), LAC-4548 (Cal.com),
LACA-2287 (`support@`), LACA-694 and LACA-1913 (the DMARC ramp programme).

## The setup

| Piece | Reality |
|---|---|
| DNS | Cloudflare |
| Inbound | Cloudflare Email Routing (`route1-3.mx.cloudflare.net`) forwarding into Gmail (gojukebox) |
| Google Workspace | **None.** This domain has no Workspace subscription |
| `admin@buildandserve.com` | A Google account with **no Gmail mailbox at all** (the Gmail API returns `400 failedPrecondition`). It exists to hold a Calendar |
| `lacy@buildandserve.com` | A Gmail send-as alias, routed through `smtp.resend.com:465`, `treatAsAlias: true`, verification `accepted`. **Aligns, and that is observed, not inferred** (see "Observed mail") |
| `support@buildandserve.com` | A Gmail send-as alias still on `smtp.gmail.com:587`, `treatAsAlias` absent. **Cannot align.** Client-facing. LACA-2287 |
| Outbound that can align | Resend, and only Resend. Not every send-as is on it, see `support@` above |

### Every send-as row, so nobody reasons from two of them

All ten rows on gojukebox@gmail.com, read 2026-10-17:

| Send-as | SMTP relay | Port | Mode |
|---|---|---|---|
| `gojukebox@gmail.com` | (primary, none) | | |
| `lacy@shipkit.io` | `smtp.resend.com` | 465 | ssl |
| `lacy@buildandserve.com` | `smtp.resend.com` | 465 | ssl |
| `me@lacymorrow.com` | `smtp.resend.com` | 465 | ssl |
| `spin@spinrc.com` | `server21.abstractdns.com` | 465 | ssl |
| **`support@buildandserve.com`** | **`smtp.gmail.com`** | **587** | **starttls** |
| 4 consumer/edu addresses | (none, correct for them) | | |

`support@` is the only address on a domain we own that is routed through
Google's own SMTP. That is the whole defect, and the table is the argument.

List the rows yourself rather than assuming, and **pass `--json`**:

```sh
gog gmail settings sendas list --account gojukebox@gmail.com --json
```

**`--json` is not a preference, it is the difference between right and wrong.**
`gog gmail settings sendas get` in its default format prints eight fields and
**silently omits `smtpMsa` entirely**:

```
send_as_email  support@buildandserve.com
display_name   Build And Serve Support
reply_to
signature
is_primary     false
is_default     false
treat_as_alias false
verification_status  accepted
```

Read that output and every alias looks like it has no SMTP relay configured,
which reads as "Gmail sends it directly" for all ten rows. It has already been
reported once as `lacy@` having "treatAsAlias: true with no smtpMsa at all."
That is the formatter, not the mailbox. `--json` shows the field.

Generalise it, because it is the same mistake as the DKIM-selector one below:
**absence in a tool's output is not absence in the world.** Confirm a field is
missing from a raw view before you say it is missing. And before calling
anything human-only, name the API call and show its error.

Verify any of it yourself in under a minute:

```sh
dig +short TXT buildandserve.com                      # SPF
dig +short TXT _dmarc.buildandserve.com               # policy
dig +short TXT resend._domainkey.buildandserve.com    # the aligned path
dig +short TXT cf2024-1._domainkey.buildandserve.com  # inbound forwarding only
dig +short MX  buildandserve.com
```

**Two DKIM selectors exist: `resend` and `cf2024-1`.** Probing only
`google`, `default`, `selector1`, `s1`, `k1`, `mail`, `dkim` returns nothing
and looks like "no DKIM is published." That conclusion has been reached and
posted at least once. It is wrong. Probe `resend` and `cf2024-1`.

`cf2024-1` is Cloudflare's signature on mail it forwards inbound. It does
nothing for outbound alignment, but it is why a bounce DSN can show
`dkim=pass header.i=@buildandserve.com`.

Generalise that: **a passing `cf2024-1` anywhere is not evidence that an
outbound path works.** Forwarded inbound mail produces a fully aligned
`dkim=pass` and shows up in the aggregate reports as a clean pass from a
Cloudflare IP (`104.30.x`). Five of the 34 messages in the Sep 25 to Oct 15
window are exactly that. Only the `resend` selector means we originated it.

## Why Google-origin mail cannot align, ever

A Google Calendar invitation organised from `admin@buildandserve.com` is
emitted by Google's own infrastructure, signed `d=google.com`, with a
`google.com` envelope sender. Under DMARC both aligned checks fail:

- **DKIM** signs as `google.com`, which does not align to `buildandserve.com`
  even under `adkim=r`.
- **SPF** is evaluated against the envelope sender, which is a
  `google.com` bounce address, so buildandserve.com's SPF record is never
  consulted.

No setting changes this. Calendar notifications cannot be routed through an
external SMTP relay; Gmail's "send mail as -> SMTP server" option only affects
mail composed in Gmail. Without a Workspace subscription publishing
`google._domainkey`, there is nothing to align with.

## Non-fixes

Both of these have been proposed by agents reading live DNS. Neither works.

1. **"Add `include:_spf.google.com` to SPF."** Buys zero alignment, for the
   envelope-sender reason above. It also authorises every Google relay to send
   with a buildandserve.com envelope. It was added on 2026-10-16, questioned,
   and reverted the same night. Do not re-add it. The same applies to
   `include:amazonses.com`, which was added in the same edit.
2. **"Enable DKIM in Google Workspace, Gmail > Authenticate email."** There is
   no Workspace for this domain, so this admin screen does not exist. This is
   not a configuration step, it is a purchase (see below).

## Standing decisions (CEO, 2026-10-15, LAC-4546)

1. **`p=quarantine` permanently.** A hold is recorded in
   `dmarc-zone-exceptions.txt` and `dmarc_ramp_preflight.sh` returns HOLD for
   this domain. `p=reject` was never the goal; mail arriving was.
2. **Client meetings move to Cal.com** (LAC-4548), the rail the site already
   books on. Stop organising client events from `admin@buildandserve.com`.
3. **No Workspace seat.** It buys company-domain branding on invites and a
   reachable `p=reject`, at the cost of a migration that can break mail.
4. **Never ramp a domain to `p=reject` while its mail is unalignable.** At
   quarantine the failure is a spam folder; at reject it is a hard bounce.
   LACA-1913 (lacymorrow.com, identical failure mode) stays held indefinitely.

**What would flip decision 3:** evidence that Lacy's ordinary client mail from
`lacy@buildandserve.com` is failing DMARC at volume. That test has now been run
twice and came back negative both times: the `rua` data (LAC-4673) and then
Resend's own delivery log, ten delivered client messages from `lacy@` with no
failures (LACA-2302, see "Observed mail"). So **decision 3 stands on data, not
inference.** Do not reopen the Workspace purchase without new
evidence of the same kind. The authoritative source is the DMARC aggregate
reports arriving at `dmarc@buildandserve.com`, read as described below, not
another round of DNS inference.

## What the aggregate reports actually say

Twenty days of `rua`, 2026-09-25 to 2026-10-15, 45 reports, 34 messages,
reparsed from the raw XML for `auth_results` (LACA-2286, LAC-4673):

| Path | Msgs | Aligned | Disposition |
|---|---|---|---|
| Resend via SES (`54.240.11.x`, `54.240.48.x`, selector `resend`) | 25 | pass | none |
| Cloudflare inbound forward (`104.30.x`, `cf2024-1`) | 5 | pass | none |
| Google relay of a Resend-signed message | 2 | DKIM pass | none |
| **Google, no DKIM at all, envelope `gmail.com`** | **1** | **fail** | **reject** |
| `sanofi.com` forward, not ours | 1 | fail | quarantine |

**32 of 33 of our messages aligned-pass.** Two recipient-side
`Authentication-Results` headers show `dmarc=pass header.from=buildandserve.com`
at `policy.dmarc=reject`: the Resend path worked even through the reject window.

The one failure is the `smtp.gmail.com:587` fingerprint, which is `support@`.

Three traps when reading this data. All three have already cost a day:

1. `orgs` in `dmarc_pull.py`'s `summary.json` is the **reporting** org, not the
   sender. It cannot tell Resend traffic from Cloudflare traffic.
2. `summary.json` carries only `policy_evaluated`. The aligned-vs-raw question
   lives in `auth_results` in the raw XML, so reparse it.
3. `dmarc_pull.py SINCE` is the **mail-search** range, not the data range. Ask
   for 30 days, get 20, because that is when reports start. Report the window
   the data has, not the one you asked for.

**What `rua` cannot tell you:** Gmail send-as traffic and Resend-API app
traffic are indistinguishable. Both emit SES IPs, selector `resend`, envelope
`send.buildandserve.com`. So the 25-message block proves the path aligns; it
does not single out the messages Lacy typed in Gmail. Closing that gap needs
Resend's own delivery log, which is what the next section is.

## Observed mail from `lacy@buildandserve.com`

Pulled 2026-10-17 (LACA-2302). `lacy@` is not just configured correctly, it is
**observed sending real client mail through Resend**, the same standard of
proof `support@` now has:

```sh
curl -s -H "Authorization: Bearer $RESEND_API_KEY" \
  'https://api.resend.com/emails?limit=100'
```

63 messages logged, 2026-09-21 to 2026-10-17. By sender:

| From | Msgs |
|---|---|
| `invoice@buildandserve.com` | 21 |
| `notify@buildandserve.com` | 28 |
| **`lacy@buildandserve.com`** | **10** |
| `support@buildandserve.com` | 2 (the LACA-2287 tests) |
| `noreply@buildandserve.com` | 2 (contact form) |

All ten `lacy@` messages show `last_event: delivered`. They are ordinary
correspondence to named clients, dated 2026-09-25 through 2026-10-17: a
Jellyfish proposal, a Klaviyo account transfer, three `Fwd:` of a BigCommerce
migration quote, `Re: RCB - Google ad account`, a Town of Harmony listing
update. `GET /emails/:id` returns the body, and it is hand-written prose.

**That is enough to attribute them to the Gmail compose path.** The app sends
as `team@` (`RESEND_FROM_EMAIL`), `invoice@`, `notify@` and `noreply@`. Nothing
in the codebase sends as `lacy@`, and no app generates a `Fwd:` of a client
quote. So the only origin for these ten is Lacy typing in Gmail and Gmail
relaying through `smtp.resend.com:465`.

Two limits worth stating. The log records the message, not the submission
protocol, so it does not literally stamp these "arrived over SMTP". And
Resend's log is the only place this exists: the `rua` data cannot show it, for
the reason in the paragraph above.

Cost: one authenticated `GET`, no DNS change, none of Lacy's time. The earlier
note that this was not worth pulling was wrong, and so was any claim that
observed proof for `lacy@` could not be obtained.

## Known blast radius

Ten days at `p=reject` (2026-10-05 to 2026-10-15) produced **one** bounce:
the copy of the Jellyfish kickoff invite addressed to `lacy@buildandserve.com`
itself. The client copy of that same invite reached `klberrie@gmail.com` and
she accepted it.

The one live defect in twenty days of reports is **`support@buildandserve.com`**
on `smtp.gmail.com:587`: header-from buildandserve.com, envelope `gmail.com`,
zero DKIM signatures, both aligned checks fail, disposition `reject`
(2026-10-10, reported by Enterprise Outlook). Same fingerprint as the Oct 9
`action=oreject` bounce to `hadas.milstein@emburyjarvis.co`. It is client-facing
and it needs no DNS change, only the send-as MSA swap to Resend. Tracked on
**LACA-2287**.

The key is no longer the blocker and never needed a human. Resend already had a
per-address convention (`Gmail - lacy@buildandserve.com`, `Gmail -
jonathan@buildandserve.com`), so `POST /api-keys` with
`permission: sending_access` and the buildandserve.com `domain_id` minted
`Gmail - support@buildandserve.com` on 2026-10-17. No coupling to the site's
production key. Enumerate with `GET /api-keys` before concluding a key must be
reused. A `sending_access` key cannot read `GET /emails`; it returns
`401 restricted_api_key`.

**The actual blocker is that send-as cannot be written by API at all.**
`gmail.users.settings.sendAs.patch` returns:

```
403 PERMISSION_DENIED
Access restricted to service accounts that have been delegated
domain-wide authority
```

This is **not** specific to `smtpMsa`. A no-op `displayName`-only patch against
`gmail.settings.basic` returns the identical 403, which is the control that
makes this a real negative rather than an assumption. gojukebox@gmail.com is a
consumer account, so domain-wide delegation cannot exist for it. Do not hunt
for a scope, a service account, or a re-auth. The Gmail web UI is the only
path, permanently. Budget it as a two-minute human paste, hand over the exact
field values, and include the rollback config.

## Who can change what

Cloudflare DNS, the Gmail account, and Invoice Ninja all live on the **LACA**
side (Zero, io). No LAC agent holds a Cloudflare secret. Changes go over
`paperclip-bridge`, not by minting new tokens.
