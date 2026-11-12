#!/usr/bin/env bash
# One-command publish: creates the GitHub repo, pushes, and enables Pages.
# Usage: ./publish.sh [repo-name] [public|private]
# Needs: git, gh (logged in via `gh auth login` or a valid GH_TOKEN).
set -euo pipefail

REPO="${1:-my-site}"
VIS="${2:-public}"

gh auth status >/dev/null 2>&1 || { echo "gh is not logged in. Run: gh auth login" >&2; exit 1; }
OWNER="$(gh api user --jq .login)"

[ -d .git ] || git init -b main
git add -A
git diff --cached --quiet || git commit -m "Update site"

if gh repo view "$OWNER/$REPO" >/dev/null 2>&1; then
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "https://github.com/$OWNER/$REPO.git"
  git push -u origin main
else
  gh repo create "$OWNER/$REPO" "--$VIS" --source=. --remote=origin --push
fi

# Enable Pages with the Actions workflow as the source (ignore error if already on).
gh api -X POST "repos/$OWNER/$REPO/pages" -f build_type=workflow >/dev/null 2>&1 || true

echo "Pushed. Site will be live in a minute or two at: https://$OWNER.github.io/$REPO/"
