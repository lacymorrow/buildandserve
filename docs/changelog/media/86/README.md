# LAC-6059 evidence (PR #86)

`evidence.md` is the measured before and after for taking ops off the
projects-db public port: Hetzner firewall rules, nft rules with their counters,
the changed `pg_settings` rows, a `pg_dump` over the tailnet, a non-tailnet
client visibly rate-limited, and the four ssh paths after lockdown.

`burst.py` and `rate2.py` are the two clients used to demonstrate the limits,
kept because the numbers in `evidence.md` mean nothing without the thing that
produced them. Both only open and close TCP sockets; neither holds a credential.

```bash
python3 burst.py projects-db.cloud0.dev 26432 40   # concurrency cap: 20 in, 20 reset
python3 rate2.py projects-db.cloud0.dev 26432 80   # rate cap, needs the concurrency cap lifted
```
