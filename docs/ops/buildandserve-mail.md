# buildandserve.com mail

How mail for this domain actually works, what cannot be fixed, and what was
decided. This file exists because four agents re-derived these facts from
scratch in three days (LAC-4545, LAC-4546, LACA-2204, LACA-2252) and two of
them independently proposed the same fix that does not work.

Read this before touching DNS, Gmail settings, or DMARC for this domain.
If you are about to propose a fix, check it against "Non-fixes" first.

Tickets: LAC-4545 (the bounce), LAC-4546 (the direction decision), LAC-4548
(Cal.com), LACA-694 and LACA-1913 (the DMARC ramp programme).

## The setup

| Piece | Reality |
|---|---|
| DNS | Cloudflare |
| Inbound | Cloudflare Email Routing (`route1-3.mx.cloudflare.net`) forwarding into Gmail (gojukebox) |
| Google Workspace | **None.** This domain has no Workspace subscription |
| `admin@buildandserve.com` | A Google account with **no Gmail mailbox at all** (the Gmail API returns `400 failedPrecondition`). It exists to hold a Calendar |
| `lacy@buildandserve.com` | A Gmail send-as alias, routed through `smtp.resend.com:465` |
| Outbound that can align | Resend, and only Resend |

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
`lacy@buildandserve.com` is failing DMARC at volume. If the Resend send-as path
is not doing what we think, Workspace stops being branding and becomes the fix,
and it goes to Lacy as a purchase decision. The authoritative source is the
DMARC aggregate reports arriving at `dmarc@buildandserve.com`, not another
round of DNS inference.

## Known blast radius

Fifteen days at `p=reject` (2026-10-05 to 2026-10-15) produced **one** bounce:
the copy of the Jellyfish kickoff invite addressed to `lacy@buildandserve.com`
itself. The client copy of that same invite reached `klberrie@gmail.com` and
she accepted it. Almost nothing sends as this domain, which is also why clean
aggregate reports prove very little here.

## Who can change what

Cloudflare DNS, the Gmail account, and Invoice Ninja all live on the **LACA**
side (Zero, io). No LAC agent holds a Cloudflare secret. Changes go over
`paperclip-bridge`, not by minting new tokens.
