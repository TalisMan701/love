#!/usr/bin/env bash
set -Eeuo pipefail

[[ "$EUID" -eq 0 ]] || { echo 'Run this script as root' >&2; exit 1; }
public_key_file=${1:?Pass the public SSH key file for GitHub Actions}
ssh-keygen -lf "$public_key_file" >/dev/null
script_dir=$(cd "$(dirname "$0")" && pwd)

# This bootstrap is for the empty Ubuntu server checked before deployment.
if command -v nginx >/dev/null || command -v apache2 >/dev/null; then
  echo 'An existing web server needs a separate configuration; stopping.' >&2
  exit 1
fi
if [[ -f /etc/caddy/Caddyfile ]] && ! cmp -s "$script_dir/Caddyfile" /etc/caddy/Caddyfile; then
  echo 'An existing Caddy configuration needs review; stopping.' >&2
  exit 1
fi

if ! command -v caddy >/dev/null; then
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    ca-certificates curl gnupg debian-keyring debian-archive-keyring apt-transport-https
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key |
    gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt \
    -o /etc/apt/sources.list.d/caddy-stable.list
  chmod 644 /usr/share/keyrings/caddy-stable-archive-keyring.gpg /etc/apt/sources.list.d/caddy-stable.list
  apt-get update
  DEBIAN_FRONTEND=noninteractive apt-get install -y caddy
fi

if ! id love-deploy >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash love-deploy
fi
install -d -o love-deploy -g love-deploy -m 755 /srv/love /srv/love/releases
install -d -o love-deploy -g love-deploy -m 700 /home/love-deploy/.ssh
authorized_keys=/home/love-deploy/.ssh/authorized_keys
touch "$authorized_keys"
public_key=$(cat "$public_key_file")
if ! grep -Fqx "restrict $public_key" "$authorized_keys"; then
  printf 'restrict %s\n' "$public_key" >> "$authorized_keys"
fi
chown love-deploy:love-deploy "$authorized_keys"
chmod 600 "$authorized_keys"

caddy validate --config "$script_dir/Caddyfile" --adapter caddyfile
if [[ ! -e /etc/caddy/Caddyfile.before-love ]]; then
  cp -a /etc/caddy/Caddyfile /etc/caddy/Caddyfile.before-love
fi
install -m 644 "$script_dir/Caddyfile" /etc/caddy/Caddyfile
systemctl enable caddy
systemctl reload-or-restart caddy
echo 'Server prepared. Upload the first release next.'
