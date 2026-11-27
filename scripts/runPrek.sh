#!/bin/sh

if [ -x "node_modules/.bin/prek" ]; then
  exec "node_modules/.bin/prek" "$@"
fi

prek_root=$(
  git worktree list --porcelain 2>/dev/null |
    sed -n 's/^worktree //p' |
    while IFS= read -r worktree; do
      if [ -x "$worktree/node_modules/.bin/prek" ]; then
        printf '%s\n' "$worktree"
        break
      fi
    done
)

if [ -n "$prek_root" ]; then
  exec "$prek_root/node_modules/.bin/prek" "$@"
fi

if command -v prek >/dev/null 2>&1; then
  exec prek "$@"
fi

echo 'prek is not installed in any existing worktree; run pnpm install in one worktree first.' >&2
exit 127
