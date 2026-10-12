#!/usr/bin/env bash
# bas-provision.sh - create the BAS automation server on Hetzner Cloud.
#
# Ticket: LAC-4279. Runbook: docs/ops/bas-automation-server.md.
#
# Idempotent: if a server named $BAS_NAME already exists in the project, this
# prints it and exits 0 without touching it. Re-running never rebuilds the box.
#
# This script only does the parts that cost money or need the Hetzner API. The
# OS layer is cloud-init below; Postgres, Paperclip and backups are
# scripts/bas-setup.sh, which runs on the box afterwards.
#
# NO SECRETS GO IN cloud-init. Hetzner returns user_data from the API and the
# box's own metadata service serves it to any local process, so anything put
# here is readable by every process on the box and by every holder of the
# project token. The Max OAuth token and the Postgres password are installed
# over ssh by bas-setup.sh instead.
set -euo pipefail

TOKEN_FILE="${HCLOUD_TOKEN_FILE:-$HOME/.paperclip/secrets/hetzner-cloud-token}"
BAS_NAME="${BAS_NAME:-bas}"
BAS_TYPE="${BAS_TYPE:-cpx31}"
BAS_IMAGE="${BAS_IMAGE:-ubuntu-24.04}"
FIREWALL_NAME="${BAS_FIREWALL:-bas-automation}"

# No default location on purpose. Hetzner's US locations carry a ~3.5x premium
# (cpx31: EUR 73.49/mo in ash vs EUR 20.49/mo in fsn1, checked 2026-10-12), so
# the location is a spend decision a person makes, not something this script
# guesses. Pass it explicitly: BAS_LOCATION=fsn1 ./scripts/bas-provision.sh
: "${BAS_LOCATION:?set BAS_LOCATION (fsn1|nbg1|hel1|ash|hil|sin) - it decides the monthly bill, see the runbook}"

[ -r "$TOKEN_FILE" ] || { echo "no Hetzner token at $TOKEN_FILE" >&2; exit 1; }
TOKEN="$(cat "$TOKEN_FILE")"

api() { # $1=method $2=path [$3=body]
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    curl -sS -X "$method" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
      -d "$body" "https://api.hetzner.cloud/v1/$path"
  else
    curl -sS -X "$method" -H "Authorization: Bearer $TOKEN" "https://api.hetzner.cloud/v1/$path"
  fi
}

existing="$(api GET "servers?name=$BAS_NAME" | jq -r '.servers[0].id // empty')"
if [ -n "$existing" ]; then
  api GET "servers/$existing" | jq -r '.server | "already exists: \(.name) id=\(.id) \(.server_type.name) \(.status) ip=\(.public_net.ipv4.ip)"'
  echo "nothing to do; this script never rebuilds an existing box"
  exit 0
fi

ssh_key_ids="$(api GET ssh_keys | jq '[.ssh_keys[] | select(.name | startswith("bas-")) | .id]')"
[ "$(echo "$ssh_key_ids" | jq 'length')" -gt 0 ] || { echo "no bas-* ssh keys in the project; upload them first" >&2; exit 1; }
firewall_id="$(api GET "firewalls?name=$FIREWALL_NAME" | jq -r '.firewalls[0].id // empty')"
[ -n "$firewall_id" ] || { echo "firewall $FIREWALL_NAME missing; create it first (see runbook)" >&2; exit 1; }

# ---- cloud-init: OS layer only ----
# Tailscale is installed but NOT brought up: joining the tailnet needs a
# credential, which per the rule above does not belong in user_data.
read -r -d '' USER_DATA <<'CLOUDINIT' || true
#cloud-config
package_update: true
package_upgrade: true
packages:
  - postgresql
  - postgresql-client
  - logrotate
  - rsync
  - jq
  - curl
  - ca-certificates
  - gnupg
  - git
  - unattended-upgrades
write_files:
  # Cap the journal on day one. Paperclip's own server.log reached 2 GB on zero
  # because nothing was rotating it; the box logs to the journal instead, and
  # the journal is the thing that has to be bounded before it is ever written to.
  - path: /etc/systemd/journald.conf.d/00-bas-cap.conf
    content: |
      [Journal]
      SystemMaxUse=500M
      SystemKeepFree=1G
      MaxRetentionSec=30day
  # Belt and braces: if Paperclip writes its own log files anyway, rotate those too.
  - path: /etc/logrotate.d/paperclip
    content: |
      /var/lib/paperclip/.paperclip/logs/*.log /var/lib/paperclip/*.log {
        daily
        rotate 7
        maxsize 100M
        missingok
        notifempty
        compress
        delaycompress
        copytruncate
      }
  # OS security patches only. This never touches npm, so the pinned Paperclip
  # version cannot move underneath us.
  - path: /etc/apt/apt.conf.d/51bas-unattended
    content: |
      APT::Periodic::Update-Package-Lists "1";
      APT::Periodic::Unattended-Upgrade "1";
      Unattended-Upgrade::Automatic-Reboot "false";
runcmd:
  - [ hostnamectl, set-hostname, bas ]
  # ssh: keys only, no root password login
  - sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
  - sed -i 's/^#*PermitRootLogin.*/PermitRootLogin prohibit-password/' /etc/ssh/sshd_config
  - systemctl restart ssh || systemctl restart sshd
  - systemctl restart systemd-journald
  # Node 22 LTS from NodeSource, for the paperclipai npm package
  - bash -c 'curl -fsSL https://deb.nodesource.com/setup_22.x | bash -'
  - DEBIAN_FRONTEND=noninteractive apt-get install -y nodejs
  # Tailscale installed, deliberately not started (no credential in user_data)
  - bash -c 'curl -fsSL https://tailscale.com/install.sh | sh'
  - systemctl enable --now postgresql
  - useradd --system --create-home --home-dir /var/lib/paperclip --shell /bin/bash paperclip
  - install -d -m 0750 -o paperclip -g paperclip /var/backups/paperclip
  - install -d -m 0750 -o root -g root /etc/paperclip
  - touch /var/lib/cloud/bas-os-ready
CLOUDINIT

body="$(jq -n \
  --arg name "$BAS_NAME" --arg type "$BAS_TYPE" --arg image "$BAS_IMAGE" \
  --arg location "$BAS_LOCATION" --arg ud "$USER_DATA" \
  --argjson keys "$ssh_key_ids" --argjson fw "$firewall_id" \
  '{name:$name, server_type:$type, image:$image, location:$location,
    ssh_keys:$keys, firewalls:[{firewall:$fw}], user_data:$ud,
    public_net:{enable_ipv4:true, enable_ipv6:true},
    labels:{role:"paperclip-automation", ticket:"LAC-4279", managed_by:"bas-provision.sh"}}')"

echo "creating $BAS_NAME ($BAS_TYPE, $BAS_IMAGE, $BAS_LOCATION)..."
created="$(api POST servers "$body")"
if ! echo "$created" | jq -e '.server.id' >/dev/null 2>&1; then
  echo "create failed: $(echo "$created" | jq -c '.error // .')" >&2
  exit 1
fi
id="$(echo "$created" | jq -r '.server.id')"
ip="$(echo "$created" | jq -r '.server.public_net.ipv4.ip')"
echo "$created" | jq -r '.server | "created id=\(.id) ip=\(.public_net.ipv4.ip)"'

printf 'waiting for running'
for _ in $(seq 60); do
  st="$(api GET "servers/$id" | jq -r '.server.status')"
  [ "$st" = "running" ] && break
  printf '.'; sleep 5
done
echo " -> $(api GET "servers/$id" | jq -r '.server.status')"

cat <<EOF

next, in order (runbook: docs/ops/bas-automation-server.md):
  1. wait for cloud-init:   ssh root@$ip 'cloud-init status --wait'
  2. join the tailnet:      ssh root@$ip 'tailscale up --hostname=bas'   (prints a URL for Lacy to click)
  3. install Paperclip:     ./scripts/bas-setup.sh $ip
EOF
