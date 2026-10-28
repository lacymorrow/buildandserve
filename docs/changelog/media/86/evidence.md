# LAC-6059 evidence, measured 2026-10-28 from zero against the live bas box

## 1. Hetzner firewall 11789519, before
```
tcp   22      0.0.0.0/0,::/0         ssh (admin access; tailscale is joined over this before lockdown)
udp   41641   0.0.0.0/0,::/0         tailscale direct wireguard; without it traffic falls back to DERP relays
icmp  -       0.0.0.0/0,::/0         ping, so reachability can be distinguished from a dead service
tcp   26432   0.0.0.0/0,::/0         projects-db postgres, TLS-only, scram
tcp   80      0.0.0.0/0,::/0         LAC-6054 certbot HTTP-01 for projects-db.cloud0.dev; nothing listens here between renewals
```

## 2. Hetzner firewall 11789519, after
```
tcp   22      178.156.130.157/32     ssh: tailnet only, which needs no rule (wireguard arrives on udp/41641). This one source is the build-and-serve box's off-tailnet dead-man check for Doug's shipping run, forced-command key only. LAC-6059
udp   41641   0.0.0.0/0,::/0         tailscale direct wireguard; without it traffic falls back to DERP relays
icmp  -       0.0.0.0/0,::/0         ping, so reachability can be distinguished from a dead service
tcp   26432   0.0.0.0/0              projects-db postgres for Vercel (LAC-6056). No ::/0: docker bridge has no IPv6, so v6 reached it via userspace docker-proxy and bypassed the DOCKER-USER rate limit (LAC-6059)
tcp   80      0.0.0.0/0,::/0         LAC-6054 certbot HTTP-01 for projects-db.cloud0.dev; nothing listens here between renewals
```

Two changes: tcp/22 from `0.0.0.0/0, ::/0` to one allowlisted off-tailnet host,
and tcp/26432 lost `::/0` because IPv6 reached postgres through userspace
docker-proxy and bypassed the rate limit entirely.

## 3. pg_settings, before and after
```
name                           before        after
authentication_timeout         60s/default   10s/command line
max_connections                100           100     (deliberately not raised)
superuser_reserved_connections 3             3
log_connections                on            on
```
Live, now:
```
authentication_timeout|10|s|command line
log_connections|on||command line
max_connections|100||command line
superuser_reserved_connections|3||default
```

## 4. Container: log cap and the IPv4-only publish
```
# before
LogConfig = {"Type":"json-file","Config":{}}        <- uncapped, on a 75 GB disk
5432/tcp -> 0.0.0.0:26432
5432/tcp -> [::]:26432                              <- the bypass

# after
LogConfig = {"Type":"json-file","Config":{"max-file":"5","max-size":"10m"}}
5432/tcp -> 0.0.0.0:26432
```

## 5. The nft rules and their counters
```
table ip filter {
	chain DOCKER-USER { # handle 44
		ip protocol tcp ct original proto-dst 26432 counter packets 4483 bytes 2144932 jump PROJECTSDB # handle 77
	}
}
table ip filter {
	chain PROJECTSDB { # handle 76
		ip saddr 100.64.0.0/10 counter packets 899 bytes 102128 return # handle 78
		tcp flags != syn / fin,syn,rst,ack counter packets 3513 bytes 2038480 return # handle 79
		tcp flags syn / fin,syn,rst,ack xt match "connlimit" counter packets 0 bytes 0 reject with tcp reset # handle 80
		tcp flags syn / fin,syn,rst,ack meter projectsdb { ip saddr timeout 60s limit rate over 10/second burst 20 packets } counter packets 0 bytes 0 reject with tcp reset # handle 81
		counter packets 71 bytes 4324 return # handle 82
	}
}
```

The jump rule's counter being non-zero is the proof that `--ctorigdstport`
was the right match. A `--dport 26432` rule here would sit at zero forever,
because DNAT has already rewritten the destination to 172.17.0.2:5432.

## 6. A non-tailnet client, visibly rate-limited

zero reaches the public name over the internet as 107.141.224.67 and the
tailnet address over wireguard, so one machine demonstrates both sides.

```
$ python3 burst.py projects-db.cloud0.dev 26432 40      # public: capped at 20
target=projects-db.cloud0.dev:26432 attempted=40 elapsed=4.96s
  established = 20
  refused/reset = 20
  timed out (dropped) = 0

$ python3 burst.py 100.117.119.81 26432 40              # tailnet: exempt
target=100.117.119.81:26432 attempted=40 elapsed=4.77s
  established = 40
  refused/reset = 0
  timed out (dropped) = 0
```

Counters after those two runs. 20 rejects on the concurrency rule from the
public source, and the tailnet RETURN absorbing the other run:
```
	chain PROJECTSDB { # handle 83
		ip saddr 100.64.0.0/10 counter packets 160 bytes 8800 return # handle 85
		tcp flags != syn / fin,syn,rst,ack counter packets 290 bytes 33609 return # handle 86
		tcp flags syn / fin,syn,rst,ack xt match "connlimit" counter packets 20 bytes 1280 reject with tcp reset # handle 87
		tcp flags syn / fin,syn,rst,ack meter projectsdb { ip saddr timeout 60s limit rate over 10/second burst 20 packets } counter packets 0 bytes 0 reject with tcp reset # handle 88
		counter packets 21 bytes 1340 return # handle 89
	}
```

The rate rule sits behind the concurrency rule, so it is shown on its own
with the concurrency cap lifted for the length of the test:
```
$ CONCURRENT=200 bas-projects-db-ratelimit.sh install   # on the box, temporarily
$ python3 rate2.py projects-db.cloud0.dev 26432 80
80 concurrent connect+close in 0.26s (310.8/s offered) -> established=21 reset=59 timeout=0

		tcp flags syn / fin,syn,rst,ack meter projectsdb { ip saddr timeout 60s limit rate over 10/second burst 20 packets } counter packets 59 bytes 3776 reject with tcp reset # handle 93
```

## 7. An ops pg_dump running over the tailnet

```
$ set -a; . ~/.paperclip/secrets/gracefully-imagined-db.env; set +a
$ psql "$OPS_DATABASE_URL" -c "select current_user, inet_client_addr(), ssl, version"
current_user|server_sees_client|ssl|version
gracefully_imagined|100.86.145.8|t|TLSv1.3
(1 row)

$ pg_dump --format=custom --no-owner --file=gi.dump "$OPS_DATABASE_URL"
(exit 0)
dump size: 155K
objects in dump: 419
6; 2615 16396 SCHEMA - payload gracefully_imagined
921; 1247 16398 TYPE payload enum_faqs_category gracefully_imagined
924; 1247 16408 TYPE payload enum_features_badge gracefully_imagined
927; 1247 16416 TYPE payload enum_features_category gracefully_imagined
```

`inet_client_addr()` is `100.86.145.8`, zero's tailnet address, so the dump
genuinely did not use the public port. No `PGSSLROOTCERT` was needed.

## 8. Auth-failure detection, against the real log

Four deliberate failures from zero's public IP, and five more over the
tailnet that the watch is supposed to ignore:
```
$ AUTH_FAIL_THRESHOLD=0 scripts/bas-projects-db-watch.sh --auth-only
projects-db problem on projects-db.cloud0.dev:
  - 4 authentication failures from outside the tailnet in the last 60m (threshold 0).
    Either a password is being guessed at on the open port, or an app is deployed
    with a stale credential.
  107.141.224.67     4  password/keepsake x3, no-hba/keepsake->shipkit_www x1

$ ssh root@bas.hyrax-boga.ts.net \
    "docker logs --since 5m projects-db 2>&1 | grep -c \"password authentication failed\""
8
```

Eight failures in the log, four reported. The five tailnet attempts were
dropped on purpose: ops typing a password wrong is not an attack.

At the real threshold of 20/hour the same run is silent and exits 0.

## 9. ssh, all four paths after the lockdown

```
$ ssh root@bas.hyrax-boga.ts.net "uptime -p"            # zero, tailnet
up 2 weeks, 1 day, 10 hours, 36 minutes

$ ssh root@128.140.50.130 echo hi                       # zero, public
ssh: connect to host 128.140.50.130 port 22: Operation timed out

$ ssh coolify-old "ssh -i /root/.ssh/ship_deadman ship@128.140.50.130"
NOT-DONE                                                # the dead-man still replies

$ ssh graphite "ssh -i ~/.ssh/fleet_health_ed25519 root@bas.hyrax-boga.ts.net \"whoami; hostname\""
root
bas
```

`NOT-DONE` is the dead-man's real answer about this morning's shipping run,
not a reachability failure. The run had not happened yet at 06:25 ET. What
matters is that the probe connected and got a reply at all: had it not, the
script would have posted "Can't reach the shipping box" to Doug's Discord.

## 10. The 6,085

```
$ journalctl -u ssh --since "14 days ago" | grep -cE "Invalid user|Failed|Connection closed by authenticating|banner exchange"
6085
```

That is what tcp/22 open to the internet was attracting on a box that
carries the BAS client control plane. Accepted logins over the same period
were 254 from graphite and 86 from zero over the tailnet, 117 from zero's
public IP (agents following a runbook that said `ssh root@128.140.50.130`,
which this change rewrites), and 2 from the dead-man host.
