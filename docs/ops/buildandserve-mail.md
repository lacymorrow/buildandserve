# buildandserve.com mail

How mail for this domain actually works, what cannot be fixed, and what was
decided. This file exists because four agents re-derived these facts from
scratch in three days (LAC-4545, LAC-4546, LACA-2204, LACA-2252) and two of
them independently proposed the same fix that does not work.

Read this before touching DNS, Gmail settings, or DMARC for this domain.
If you are about to propose a fix, check it against "Non-fixes" first.

Tickets: LAC-4545 (the bounce), LAC-4546 (the direction decision), LAC-4673
(the `rua` evidence), LAC-4548 (Cal.com), LACA-2287 (`support@`), LACA-694 and
LACA-1913 (the DMARC ramp programme).

## The setup

| Piece | Reality |
|---|---|
| DNS | Cloudflare |
| Inbound | Cloudflare Email Routing (`route1-3.mx.cloudflare.net`) forwarding into Gmail (gojukebox) |
| Google Workspace | **None.** This domain has no Workspace subscription |
| `admin@buildandserve.com` | A Google account with **no Gmail mailbox at all** (the Gmail API returns `400 failedPrecondition`). It exists to hold a Calendar |
| `lacy@buildandserve.com` | A Gmail send-as alias, routed through `smtp.resend.com:465`, `treatAsAlias: true`, verification `accepted`. **Aligns.** |
| `support@buildandserve.com` | A Gmail send-as alias still on `smtp.gmail.com:587`, no `treatAsAlias`. **Cannot align.** Client-facing. LACA-2287 |
| Outbound that can align | Resend, and only Resend. Not every send-as is on it, see `support@` above |

List the send-as rows yourself rather than assuming:

```sh
gog gmail settings sendas list --account gojukebox@gmail.com --json
```

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

Both of these have been proposed by agents reading live DNS. Neither fixes the
fault in the title.

1. **"Add `include:_spf.google.com` to SPF."** Buys zero alignment, for the
   envelope-sender reason above, and so does not fix Calendar invites or any
   other Google-origin mail. **It is nevertheless live as of 2026-10-17, on
   Lacy's explicit instruction. Leave it alone.** It is close to free: one DNS
   lookup (the record is flat, no nested includes) and no practical spoofing
   surface, because Google requires domain verification before a tenant can
   send with your envelope. Do not remove it without Lacy, and do not expect it
   to have fixed anything.
2. **"Also add `include:amazonses.com`."** Declined on 2026-10-17 and it should
   stay declined. There is no SES sending path of ours to authorise (Resend's
   SES traffic uses its own `send.buildandserve.com` envelope and the `resend`
   DKIM key), SES is shared infrastructure, and every needless include spends
   part of the 10-lookup SPF budget.
3. **"Enable DKIM in Google Workspace, Gmail > Authenticate email."** There is
   no Workspace for this domain, so this admin screen does not exist. This is
   not a configuration step, it is a purchase (see below).

### The SPF edit timeline, so nobody hunts a phantom second writer

All times UTC. This record was written three times in 20 hours and the middle
write was mine, which is not obvious from Cloudflare's metadata alone.

| When | What |
|---|---|
| 2026-10-16 23:11 | widened to add `_spf.google.com` + `amazonses.com` on Lacy's go, announced in Slack |
| 2026-10-16 ~23:15 | CEO measures the widened record live on 1.1.1.1 and the authoritative NS |
| 2026-10-16 ~23:20 | CEO questions it over the bridge, not knowing Lacy had authorised it |
| **2026-10-16 23:38:57** | **io reverts to Cloudflare-only. This is the `modified_on` that looks suspicious** |
| 2026-10-17 19:15 | re-applied with `_spf.google.com` only, on Lacy's second explicit go |

A `modified_on` later than the edit you are looking for means someone wrote
after you, not that your write failed. Check for a revert before concluding the
save was lost.

**The actual lesson:** an authorised change and a well-meant revert crossed
because the authorisation was in Slack and the revert reasoning was in
Paperclip. When you change DNS on Lacy's say-so, put "authorised by Lacy,
<quote>, <time>" in the change record itself. A reviewer who cannot see the
authorisation reads the change as drift and undoes it.

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
(LAC-4673, 2026-10-17) and it came back negative, so **decision 3 stands on
data, not inference.** Do not reopen the Workspace purchase without new
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
does not single out the messages Lacy typed in Gmail. Closing that last gap
needs Resend's own delivery log. Not worth Lacy's time to pull.

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
and it needs no DNS change, only the send-as MSA swap to Resend once a key
exists. Tracked on **LACA-2287**.

## Who can change what

Cloudflare DNS, the Gmail account, and Invoice Ninja all live on the **LACA**
side (Zero, io). No LAC agent holds a Cloudflare secret. Changes go over
`paperclip-bridge`, not by minting new tokens.
