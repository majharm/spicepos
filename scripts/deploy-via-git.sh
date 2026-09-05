#!/usr/bin/env bash
# Deploy to Hostinger without FTP: push the current Git branch.
# Hostinger's Node.js GitHub app pulls the commit, runs npm install, and restarts Express.
set -euo pipefail

cd "$(dirname "$0")/.."

DEPLOY_BRANCH="${DEPLOY_BRANCH:-$(git branch --show-current)}"
TAG_PREFIX="${TAG_PREFIX:-deploy}"

if [[ -z "$DEPLOY_BRANCH" ]]; then
  echo "Not on a branch." >&2
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit or stash local changes before deploying." >&2
  exit 1
fi

current="$(git branch --show-current)"
if [[ "$current" != "$DEPLOY_BRANCH" ]]; then
  echo "Switch to $DEPLOY_BRANCH first (currently on $current)." >&2
  exit 1
fi

echo "Running pre-deploy checks on $DEPLOY_BRANCH..."
node --check server.js
node --check server/index.js
node --check js/app.js
node --check js/qr-order.js
npm test

latest=0
while IFS= read -r t; do
  n="${t#${TAG_PREFIX}}"
  if [[ "$n" =~ ^[0-9]+$ ]] && ((10#$n > latest)); then
    latest=$((10#$n))
  fi
done < <(git tag -l "${TAG_PREFIX}*")
tag="${TAG_PREFIX}$((latest + 1))"

git tag -a "$tag" -m "Hostinger Git deploy $tag"
git push -u origin "$DEPLOY_BRANCH"
git push origin "$tag"

cat <<EOF

Pushed $DEPLOY_BRANCH and tag $tag.

If this GitHub repo is connected in hPanel as a Node.js web app, Hostinger
will rebuild and restart automatically. Otherwise:

  hPanel → Websites → your site → Deployments → Redeploy

Do not use FTP, File Manager uploads, or zip bundles.
EOF
