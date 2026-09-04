#!/usr/bin/env bash
# Deploy to Hostinger without FTP: push to the Git-connected branch.
# Hostinger pulls from GitHub and restarts the Node.js app automatically.
set -euo pipefail

cd "$(dirname "$0")/.."

DEPLOY_BRANCH="${DEPLOY_BRANCH:-cursor/multi-tenant-saas-pos-1a88}"
TAG_PREFIX="${TAG_PREFIX:-deploy}"

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit or stash local changes before deploying." >&2
  exit 1
fi

current="$(git branch --show-current)"
if [[ "$current" != "$DEPLOY_BRANCH" ]]; then
  echo "Switch to $DEPLOY_BRANCH first (currently on $current)." >&2
  exit 1
fi

echo "Running pre-deploy checks..."
node --check js/app.js
node --check server.js
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
git push origin "$DEPLOY_BRANCH"
git push origin "$tag"

cat <<EOF

Pushed $DEPLOY_BRANCH and tag $tag.

If pos.atavtelecom.in is connected to this repo in hPanel, Hostinger will
redeploy automatically within a few minutes. Otherwise:

  hPanel → Websites → pos.atavtelecom.in → Deployments → Redeploy

No FTP or zip upload is required.
EOF
