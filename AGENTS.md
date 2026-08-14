# Repository Guidelines

Follow the project naming rules in
[docs/references/naming-conventions.md](docs/references/naming-conventions.md).

# Operational Rules
- **Write conventional commits**: Commit small, focused changes using Conventional Commit messages (e.g., `feat(data-api):`, `fix(lifecycle):`, `refactor(quick-assistant):`, `docs(testing):`, `chore(deps):`, `test(window-manager):`). Scope must be a specific kebab-case module, never generic like `main` — when `git log` conflicts with this rule, this rule wins.
- **Test behaviour, at the lowest layer that has it**: A test earns its place by failing when a defect exists and only then. Never assert that a wrapper forwards its props, that a mock was called, or that a render produced something. Cover logic in pure functions and hooks instead of re-asserting it through a screen render — screen-level render suites are not written here at all, because device coverage runs through agent-device. Always cover data contracts (DB schema, migrations, anything serialized), upstream patch guards, and regressions for bugs that were actually fixed. When removing a test, the justification must be that it has no protective value; slowness is a reason to change how it runs, not whether it exists.
