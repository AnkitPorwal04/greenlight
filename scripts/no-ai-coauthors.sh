#!/usr/bin/env bash
set -uo pipefail

RANGE="${1:-HEAD}"

TOOLS='claude|anthropic|copilot|chatgpt|openai|gemini|bard|codex|cursor|devin|aider|sourcegraph|tabnine|codeium|windsurf'
TRAILER="^[[:space:]]*co-authored-by:.*(${TOOLS})"
SESSION="^[[:space:]]*[a-z0-9_-]*-session:[[:space:]]*https?://"
GENERATED="^[[:space:]]*(generated with|🤖 generated with).*(${TOOLS})"

offenders=""
while read -r sha; do
  [ -n "$sha" ] || continue
  body=$(git show -s --format='%B' "$sha")
  if printf '%s\n' "$body" | grep -Eiq "${TRAILER}|${SESSION}|${GENERATED}"; then
    line=$(git show -s --format='%h  %an  %s' "$sha")
    hit=$(printf '%s\n' "$body" | grep -Ei "${TRAILER}|${SESSION}|${GENERATED}" | head -2 | sed 's/^[[:space:]]*/      /')
    offenders=$(printf '%s\n  %s\n%s\n' "$offenders" "$line" "$hit")
  fi
done < <(git log --format='%H' "$RANGE")

if [ -n "${offenders// /}" ]; then
  echo "AI co-author attribution found in commit messages:"
  printf '%s\n' "$offenders"
  echo ""
  echo "Remove these trailers. They credit AI tools as contributors on GitHub."
  echo "For an unpushed commit:      git commit --amend"
  echo "For commits already pushed:  ask before rewriting shared history."
  exit 1
fi

echo "No AI co-author attribution found."
