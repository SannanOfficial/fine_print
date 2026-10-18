#!/usr/bin/env bash
#
# Puts one release of Fine Print live. Runs on the server as the deployment
# user, from a release folder GitHub Actions has just uploaded:
#
#   ~/fine_print/releases/<id>/deploy/remote-deploy.sh <id>
#
# It installs dependencies and builds inside that folder, so the live site
# keeps running from the previous release meanwhile. Then it points
# ~/fine_print/current at the new release, restarts the site, and checks it
# answers. If it doesn't, `current` goes back to the previous release.
# The newest few releases are kept for rolling back by hand:
#
#   ln -sfn ~/fine_print/releases/<older id> ~/fine_print/current
#   sudo systemctl restart fineprint-web.service
#
set -euo pipefail

APP="$HOME/fine_print"
ID="${1:?usage: remote-deploy.sh <release id>}"
RELEASE="$APP/releases/$ID"
PORT=3005
KEEP=5

[ -d "$RELEASE" ] || { echo "No release at $RELEASE" >&2; exit 1; }

# Node 24 (Fedora's nodejs24 package) for npm, the build and its scripts;
# the system's default `node` stays as it is for the other apps on this server.
mkdir -p "$APP/bin"
ln -sfn /usr/bin/node-24 "$APP/bin/node"
ln -sfn /usr/bin/npm-24 "$APP/bin/npm"
ln -sfn /usr/bin/npx-24 "$APP/bin/npx"
export PATH="$APP/bin:$PATH"
export NEXT_TELEMETRY_DISABLED=1
echo "Node $(node --version), npm $(npm --version)"

cd "$RELEASE"
# Public settings the build bakes in (the site's address, search-engine
# verification codes). No secrets are needed to build.
if [ -r /etc/fineprint/build.env ]; then
  set -a
  # shellcheck disable=SC1091
  . /etc/fineprint/build.env
  set +a
fi

echo "== Installing dependencies"
npm ci --no-audit --no-fund
echo "== Building"
npm run build

previous="$(readlink "$APP/current" 2>/dev/null || true)"
switch_to() {
  ln -sfn "$1" "$APP/current.next"
  mv -Tf "$APP/current.next" "$APP/current"
}

echo "== Switching to $ID"
switch_to "$RELEASE"
sudo -n /usr/bin/systemctl restart fineprint-web.service

# The home page loads (so the database is reachable) and an unknown address
# gets a real 404 (so the site's own routing works).
answers() {
  for _ in $(seq 1 45); do
    home="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT/" || true)"
    missing="$(curl -s -o /dev/null -w '%{http_code}' --max-time 5 "http://localhost:$PORT/deploy-check/not/a/page" || true)"
    if [ "$home" = 200 ] && [ "$missing" = 404 ]; then return 0; fi
    sleep 1
  done
  echo "Home page answered $home; an unknown address answered $missing (expected 200 and 404)." >&2
  return 1
}

if ! answers; then
  echo "The new release didn't answer on port $PORT." >&2
  if [ -n "$previous" ] && [ -d "$previous" ]; then
    echo "Rolling back to $(basename "$previous")." >&2
    switch_to "$previous"
    sudo -n /usr/bin/systemctl restart fineprint-web.service
  fi
  exit 1
fi
echo "== Live: $ID"

# Keep the newest releases (the live one among them); remove the rest.
cd "$APP/releases"
live="$(basename "$(readlink "$APP/current")")"
ls -1t | tail -n +"$((KEEP + 1))" | while read -r old; do
  [ "$old" != "$live" ] && rm -rf -- "$old"
done
echo "== Done"
