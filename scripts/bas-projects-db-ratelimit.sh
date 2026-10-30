#!/usr/bin/env bash
#
# Pre-auth connection limits for projects-db on the bas box (LAC-6059).
#
# Covers BOTH listeners: 26432 (Postgres) and 26433 (PgBouncer). The pooled port
# was outside these rules when it was added, because the jump keyed on
# `--ctorigdstport 26432` and nothing else matched (LAC-6122 F2). Opening 26433
# to 0.0.0.0/0 in that state would have put a world-open listener on the box with
# none of the protection this file exists to provide.
#
# PgBouncer is the worse of the two to leave unprotected. It is single-threaded
# and it terminates TLS, so a handshake flood blocks every real client on the
# same thread, where Postgres forks per connection and holds
# authentication_timeout=10s. max_client_conn=1000 against PgBouncer's default
# client_login_timeout of 60s means a thousand half-finished logins can wedge the
# pooler a minute at a time.
#
# tcp/26432 is world-open because Vercel egress has no fixed IP range (LAC-6056).
# That decision is settled. What it leaves behind is that the expensive part of a
# connection happens before anyone proves who they are:
#
#   max_connections 100, superuser_reserved_connections 3, so 97 usable slots
#   shared by all five project databases on this box.
#
# Postgres reserves the backend slot at fork, and only checks the per-role
# CONNECTION LIMIT after authentication succeeds. So the per-role CONNECTION
# LIMIT every project role carries stops a runaway app and stops nothing else
# (the values live in docs/ops/bas-projects-db.md and have already changed once;
# nothing here depends on them): one host that opens 97 TCP sessions and never
# finishes
# a SCRAM exchange takes every project down for as long as it keeps doing it, and
# never authenticates as anybody. There is no password involved and no log line
# saying who. LAC-6059 cut authentication_timeout from 60s to 10s, which divides
# the hold time by six; this file is the other half, which caps the arrival rate.
#
# ## Why the rules match on the ORIGINAL destination port
#
# The rules say `--ctorigdstport 26432`, not `--dport 26432`, and that is
# load-bearing. A Docker published port is DNAT'd in nat/PREROUTING, which runs
# before the filter FORWARD chain that DOCKER-USER hangs off. By the time a
# packet reaches DOCKER-USER its destination is already 172.17.0.2:5432, so a
# `--dport 26432` rule here is installed successfully, shows up in the chain, and
# matches nothing, forever. conntrack remembers the pre-DNAT tuple, which is what
# --ctorigdstport reads.
#
# The same ordering is why `ufw deny 26432` is useless on this box and why
# DOCKER-USER (or the Hetzner firewall) is the only place that works.
#
# ## Why the tailnet is exempt
#
# Ops runs over the tailnet now (LAC-6059): dumps, restores, migrations, psql.
# A pg_dump legitimately opens connections in a burst, and the one thing worse
# than no rate limit is a rate limit that throttles a restore at 3am. WireGuard
# has already authenticated both ends of anything arriving from 100.64.0.0/10,
# so it is not the traffic this is defending against.
#
# ## REJECT, not DROP
#
# DROP is cheaper and is the usual reflex for abuse. It is the wrong choice here
# because the clients on the other side of this port are Vercel functions on a
# wall-clock timeout. A dropped SYN makes a legitimate but bursty caller hang
# until its own timeout expires and burn the function's whole budget; a reset
# fails in milliseconds and lets the driver retry. The attack this defends
# against is exhaustion, and a reset frees the slot just as well as a drop does.
#
# ## One chain, one budget, both ports
#
# Both ports jump into the same $CHAIN, so a source address gets ONE budget of
# $CONCURRENT concurrent sessions and ONE rate of $RATE across both of them
# rather than a separate allowance per port. That is deliberate: the resource
# being defended is the box, and `xt_connlimit` counts conntrack entries per
# source address rather than per port anyway, so a per-port budget was never
# really available. `hashlimit` shares one hash table for the same reason: the
# `--hashlimit-name` is the table, and both rules name `projectsdb`.
#
# Idempotent. Run `install` as many times as you like.
#
# Runbook: docs/ops/bas-projects-db.md
set -uo pipefail

# Both listeners. $PORT is still honoured for a one-off run against a single
# port; the systemd unit passes neither, so the default is what production gets.
PORTS=${PORTS:-${PORT:-26432 26433}}
CHAIN=${CHAIN:-PROJECTSDB}
# Tailscale's CGNAT range. Every tailnet peer has an address in it and nothing
# else on the internet may use it, so it is safe as an exemption key here in a
# way that a public source allowlist would not be.
TAILNET=${TAILNET:-100.64.0.0/10}
# Concurrent half-open or idle sessions one source address may hold. 20 is a
# fifth of the box, which is a share no single caller should ever need and which
# leaves 77 slots standing while one source misbehaves.
CONCURRENT=${CONCURRENT:-20}
# New connections per second per source, with a burst so a cold start that opens
# a pool all at once is not punished for it.
RATE=${RATE:-10/sec}
BURST=${BURST:-20}

die() {
	echo "$*" >&2
	exit 1
}

# iptables here is the nf_tables backend (iptables v1.8.10 (nf_tables)), so these
# rules land in `table ip filter` and read back with `nft list chain ip filter
# DOCKER-USER`. Using the iptables front end rather than writing nft rules by
# hand keeps one backend in charge of a chain Docker also edits.
ipt() { iptables "$@"; }

jump_spec_for() { printf '%s\n' -p tcp -m conntrack --ctorigdstport "$1" -j "$CHAIN"; }

install_rules() {
	command -v iptables >/dev/null || die "iptables not found"
	ipt -m conntrack --help 2>&1 | grep -q -- --ctorigdstport ||
		die "this iptables has no conntrack --ctorigdstport; the rules would match nothing"
	ipt -m connlimit --help 2>&1 | grep -q -- --connlimit-above ||
		die "this iptables has no connlimit match"
	ipt -m hashlimit --help 2>&1 | grep -q -- --hashlimit-above ||
		die "this iptables has no hashlimit match"

	# Docker creates DOCKER-USER itself and jumps to it first from FORWARD. Our
	# rules live in our own chain so that flushing and reinstalling them cannot
	# touch anything Docker put there.
	ipt -N "$CHAIN" 2>/dev/null || ipt -F "$CHAIN"

	local port jump
	for port in $PORTS; do
		mapfile -t jump < <(jump_spec_for "$port")
		ipt -C DOCKER-USER "${jump[@]}" 2>/dev/null ||
			ipt -I DOCKER-USER 1 "${jump[@]}"
	done

	ipt -A "$CHAIN" -s "$TAILNET" -j RETURN
	# Only the opening SYN is gated. Gating established traffic would count every
	# packet of a healthy session against the rate and throttle real queries.
	ipt -A "$CHAIN" -p tcp ! --syn -j RETURN
	ipt -A "$CHAIN" -p tcp --syn \
		-m connlimit --connlimit-above "$CONCURRENT" --connlimit-mask 32 \
		-j REJECT --reject-with tcp-reset
	ipt -A "$CHAIN" -p tcp --syn \
		-m hashlimit --hashlimit-mode srcip \
		--hashlimit-above "$RATE" --hashlimit-burst "$BURST" \
		--hashlimit-name projectsdb --hashlimit-htable-expire 60000 \
		-j REJECT --reject-with tcp-reset
	ipt -A "$CHAIN" -j RETURN
}

uninstall_rules() {
	local port jump
	for port in $PORTS; do
		mapfile -t jump < <(jump_spec_for "$port")
		while ipt -C DOCKER-USER "${jump[@]}" 2>/dev/null; do
			ipt -D DOCKER-USER "${jump[@]}"
		done
	done
	ipt -F "$CHAIN" 2>/dev/null
	ipt -X "$CHAIN" 2>/dev/null
	true
}

show_rules() {
	echo "== FORWARD -> DOCKER-USER -> $CHAIN for port(s) $PORTS, with counters =="
	nft -a list chain ip filter DOCKER-USER 2>/dev/null ||
		ipt -L DOCKER-USER -n -v --line-numbers
	echo
	nft -a list chain ip filter "$CHAIN" 2>/dev/null ||
		ipt -L "$CHAIN" -n -v --line-numbers
}

case "${1:-}" in
install) install_rules && show_rules ;;
uninstall) uninstall_rules ;;
show) show_rules ;;
*) die "usage: $0 {install|uninstall|show}" ;;
esac
