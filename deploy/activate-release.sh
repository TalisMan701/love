#!/usr/bin/env bash
set -Eeuo pipefail

release_id=${1:?Pass a release ID}
[[ "$release_id" =~ ^[a-f0-9]{40}-[0-9]+-[0-9]+$ ]] || {
  echo 'Invalid release ID' >&2
  exit 1
}
site_root=/srv/love
release_dir="$site_root/releases/$release_id"

exec 9>"$site_root/.deploy.lock"
flock -w 60 9

for file in index.html styles.css app.js config.js preload.js favicon.svg media/gymnopedie-no-1.mp3; do
  if [[ ! -s "$release_dir/$file" || -L "$release_dir/$file" ]]; then
    echo "Missing or invalid release file: $file" >&2
    exit 1
  fi
done

find "$release_dir" -type d -exec chmod 755 {} +
find "$release_dir" -type f -exec chmod 644 {} +
printf '%s\n' "$release_id" > "$release_dir/release.txt"
chmod 644 "$release_dir/release.txt"

previous=$(readlink "$site_root/current" || true)
pending="$site_root/.current-$release_id"
ln -s -- "$release_dir" "$pending"
mv -Tf -- "$pending" "$site_root/current"

# Check through Caddy itself. Restore the previous release if it cannot serve the new one.
actual=$(curl --fail --silent --show-error --retry 3 --retry-delay 2 --max-time 10 \
  -H 'Host: 77.221.154.156' http://127.0.0.1/release.txt) || actual=''
if [[ "$actual" != "$release_id" ]]; then
  if [[ -n "$previous" ]]; then
    ln -s -- "$previous" "$pending"
    mv -Tf -- "$pending" "$site_root/current"
  else
    rm -f -- "$site_root/current"
  fi
  echo 'Health check failed; restored the previous release' >&2
  exit 1
fi

printf 'Activated release %s\n' "$release_id"
