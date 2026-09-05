# Project Skills

This directory owns the shared project skill copies. Personal skill selection and agent preferences
belong in user-level configuration. Repository architecture and conventions take precedence over
incompatible generic examples.

- `public-skills.txt` lists the versioned skills. Each needs a nonempty `SKILL.md`.
- `pnpm skills:sync` generates the whitelist ignore files and `.claude/skills` symlinks.
- `pnpm skills:check` checks entry points, generated files, links, and tracked-file scope.
- `pnpm docs:check-links` checks relative file links in public skill Markdown. Write required local
  skill dependencies as relative Markdown links so a missing prerequisite is detectable.
- `skills-lock.json` records upstream installation hashes, not proof that the skill is present or
  that project adaptations match upstream. Preserve reviewed project adaptations when updating.

The restored prerequisite skills use these upstream snapshots without content changes:

- [gh-stack](https://github.com/github/gh-stack/tree/2bd699a544a09cb5c45a013d03416e0894b0454e/skills/gh-stack)
- [vercel-composition-patterns](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/composition-patterns)

For package-local instructions, use `AGENTS.md` as the canonical file and a sibling
`CLAUDE.md -> AGENTS.md` symlink, matching the repository root. Keep tool-specific entry points
from becoming independently edited copies.
