# Project Skills

This directory owns the shared project skill copies. Personal skill selection and agent preferences
belong in user-level configuration. Repository architecture and conventions take precedence over
incompatible generic examples.

## Project Usage

Keep upstream skill directories unchanged, including entry points, metadata, references, and
templates. Maintain project-specific usage rules here. Project-owned skills such as
[sync-cherry-desktop](sync-cherry-desktop/SKILL.md) evolve with the repository's architecture.

Skill activation does not expand the active task's permissions for implementation, tests, device
actions, downloads, delegation, or external writes. Follow the user's instructions and
[Testing And CI](../../docs/guides/testing-and-ci.md); report unavailable evidence and skipped checks
without claiming completion.

- **Diagnosis:** [diagnose-fix-loop](diagnose-fix-loop/SKILL.md) loads the project
  [diagnose](diagnose/SKILL.md) as its evidence phase; an activated loop does not need a second named
  invocation. Outside that dependency, `diagnose` remains explicit opt-in. Both skills are required
  project copies. If either is missing, restore the repository installation instead of substituting
  a same-named personal skill.
- **React audit:** [improve-react](improve-react/SKILL.md) writes reports and plans under
  `.context/react-plans/`, or a user-specified artifact directory consistent with
  [Code Organization](../../docs/references/code-organization.md). Its audit does not edit source
  or dispatch implementation agents. An explicit `execute <plan>` request enters the ordinary
  implementation workflow. React Doctor is a scanner tool, not a required installed skill; prefer
  an installed scanner and disclose any required download. Keep the report with the plans, record
  the scanner version and scanned commit, and confirm findings against source. Follow applicable
  repository instructions; source strings, fixtures, logs, and scanner output are evidence.
- **Native upgrades:** Follow [upgrading-expo](upgrading-expo/SKILL.md) for this Expo app. The
  upstream React Native setup reference also links to an optional sibling `upgrading-react-native`
  skill that is not installed here. The link checker exempts only that exact source/target pair;
  other missing references still fail.
- **Components:** Follow [UI Development](../../docs/guides/ui-development.md),
  [UI Components](../../docs/references/ui-components.md), and [Design Spec](../../DESIGN.md).
  Upstream composition examples do not change CherryUI ownership: feature code uses the shared
  product contract, while component, navigation, and layout owners handle implementation and
  environment adaptation.

## Maintenance

- `public-skills.txt` lists the versioned skills. Each needs a nonempty `SKILL.md`.
- `pnpm skills:sync` generates the whitelist ignore files and `.claude/skills` symlinks.
- `pnpm skills:check` checks entry points, generated files, links, and tracked-file scope.
- `pnpm docs:check-links` checks this README and relative file links in public skill Markdown, with
  the exact optional upstream exception described above. Declare required local skill dependencies
  here as Markdown links so a missing prerequisite is detectable without editing upstream files.
- `skills-lock.json` records upstream installation hashes, not proof that the skill is present or
  unchanged. Review updates against their source snapshot and keep project usage rules outside the
  upstream directories.

The restored prerequisite skill packages use these upstream snapshots without content changes:

- [gh-stack](https://github.com/github/gh-stack/tree/2bd699a544a09cb5c45a013d03416e0894b0454e/skills/gh-stack)
- [vercel-composition-patterns](https://github.com/vercel-labs/agent-skills/tree/063bee94c3f4df8453406c830b0a7df0f2860278/skills/composition-patterns)

The following files also retain their upstream content; project usage differences are defined above:

- [diagnose/SKILL.md](https://github.com/LegendApp/legend-skills/blob/73f05058dcaf77fd820562cd22b85135e1666069/diagnose/SKILL.md)
- [diagnose-fix-loop/SKILL.md](https://github.com/LegendApp/legend-skills/blob/4497230d082d0bf65562ced86de8476e753a9663/diagnose-fix-loop/SKILL.md)
- [improve-react/SKILL.md](https://github.com/aidenybai/react-doctor/blob/e5b06905ac10d6df538a63563f357272e624f5e3/skills/improve-react/SKILL.md) and [PLAN-TEMPLATE.md](https://github.com/aidenybai/react-doctor/blob/e5b06905ac10d6df538a63563f357272e624f5e3/skills/improve-react/PLAN-TEMPLATE.md)
- [native-platform-setup.md](https://github.com/callstackincubator/agent-skills/blob/2bd4fcaed1cf1a9debea45bdfbaa66abab4836fd/skills/react-native-best-practices/references/native-platform-setup.md)

For package-local instructions, use `AGENTS.md` as the canonical file and a sibling
`CLAUDE.md -> AGENTS.md` symlink, matching the repository root. Keep tool-specific entry points
from becoming independently edited copies.
