#!/usr/bin/env bash
set -Eeuo pipefail

script_dir=$(cd "$(dirname "$0")" && pwd)
fixture=$(mktemp -d /tmp/love-deploy-test.XXXXXXXX)
trap 'rm -rf -- "$fixture"' EXIT
site="$fixture/site"
mkdir -p "$site/releases" "$fixture/bin"

# Exercise the real activation script in an isolated directory. Mock only HTTP responses.
sed "s|^site_root=/srv/love$|site_root=$site|" "$script_dir/activate-release.sh" > "$fixture/activate.sh"
cat > "$fixture/bin/curl" <<'MOCK'
#!/usr/bin/env bash
if [[ "${TEST_CURL_FAIL:-0}" == 1 ]]; then exit 22; fi
printf '%s\n' "$TEST_CURL_RESPONSE"
MOCK
chmod 755 "$fixture/bin/curl"
export PATH="$fixture/bin:$PATH"

previous="$(printf 'a%.0s' {1..40})-1-1"
next="$(printf 'b%.0s' {1..40})-2-1"
mkdir -p "$site/releases/$previous"
ln -s "$site/releases/$previous" "$site/current"

make_release() {
  mkdir -p "$site/releases/$next/media"
  for file in index.html styles.css app.js config.js preload.js favicon.svg media/gymnopedie-no-1.mp3; do
    printf 'fixture\n' > "$site/releases/$next/$file"
  done
}

# Reject incomplete uploads before switching the live symlink.
mkdir -p "$site/releases/$next"
if TEST_CURL_RESPONSE="$next" bash "$fixture/activate.sh" "$next" >/dev/null 2>&1; then
  echo 'Incomplete release was accepted' >&2; exit 1
fi
[[ "$(readlink "$site/current")" == "$site/releases/$previous" ]]

make_release
# Reject a healthy HTTP response belonging to another release, and restore the old one.
if TEST_CURL_RESPONSE=wrong bash "$fixture/activate.sh" "$next" >/dev/null 2>&1; then
  echo 'Wrong release passed health check' >&2; exit 1
fi
[[ "$(readlink "$site/current")" == "$site/releases/$previous" ]]

# A network/server failure must also restore the previous release.
if TEST_CURL_FAIL=1 bash "$fixture/activate.sh" "$next" >/dev/null 2>&1; then
  echo 'HTTP failure passed health check' >&2; exit 1
fi
[[ "$(readlink "$site/current")" == "$site/releases/$previous" ]]

TEST_CURL_RESPONSE="$next" bash "$fixture/activate.sh" "$next"
[[ "$(readlink "$site/current")" == "$site/releases/$next" ]]
[[ "$(cat "$site/current/release.txt")" == "$next" ]]

# Failure during the very first publication must not leave a broken live symlink.
rm -- "$site/current"
if TEST_CURL_RESPONSE=wrong bash "$fixture/activate.sh" "$next" >/dev/null 2>&1; then
  echo 'Initial failed release was accepted' >&2; exit 1
fi
[[ ! -e "$site/current" && ! -L "$site/current" ]]

if TEST_CURL_RESPONSE="$next" bash "$fixture/activate.sh" '../../outside' >/dev/null 2>&1; then
  echo 'Invalid release ID was accepted' >&2; exit 1
fi
echo 'Activation checks passed: complete upload, rollback, first deployment, invalid ID.'
