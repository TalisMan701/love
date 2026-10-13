#!/usr/bin/env bash
set -Eeuo pipefail

cd "$(dirname "$0")/.."
: "${DEPLOY_SSH_KEY:?Add the DEPLOY_SSH_KEY repository secret in GitHub Actions}"
: "${RELEASE_ID:?Set RELEASE_ID to a unique release name}"
[[ "$RELEASE_ID" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || {
  echo 'Invalid release ID' >&2
  exit 1
}

ssh_dir=$(mktemp -d)
trap 'rm -f -- "$ssh_dir/key"; rmdir -- "$ssh_dir"' EXIT
chmod 700 "$ssh_dir"
printf '%s\n' "$DEPLOY_SSH_KEY" | tr -d '\r' > "$ssh_dir/key"
unset DEPLOY_SSH_KEY
chmod 600 "$ssh_dir/key"
ssh-keygen -y -f "$ssh_dir/key" >/dev/null

ssh_options=(
  -i "$ssh_dir/key"
  -p 22
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$PWD/deploy/known_hosts"
  -o ConnectTimeout=15
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=3
)
target=love-deploy@77.221.154.156
release_dir="/srv/love/releases/$RELEASE_ID"

# mkdir intentionally fails if this release already exists; do not modify a live release.
ssh "${ssh_options[@]}" "$target" "mkdir -m 755 -- '$release_dir'"
tar -C letter-for-you/dist -czf - . |
  ssh "${ssh_options[@]}" "$target" "tar -xzf - --no-same-owner --no-same-permissions -C '$release_dir'"
ssh "${ssh_options[@]}" "$target" "bash -s -- '$RELEASE_ID'" < deploy/activate-release.sh
