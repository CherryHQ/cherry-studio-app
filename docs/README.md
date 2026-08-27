# Cherry Studio Mobile Documentation

This directory is the entry point for project-owned documentation.

## Guides

Guides are task-oriented procedures for changing or extending the application.

| Document | Description |
| --- | --- |
| [Extending Cherry Mobile](./guides/extending.md) | Add resource endpoints, workflows, persistence, backend behavior, and UI |
| [Git Workflow](./guides/git-workflow.md) | Commits, stacked PRs, review readiness, and case-only renames |
| [Parallel Device Testing](./guides/parallel-device-testing.md) | Conductor port, iOS simulator, and Android emulator isolation and cleanup |
| [Testing And CI](./guides/testing-and-ci.md) | Focused checks, test value, local PR gates, and remote CI |
| [UI Development](./guides/ui-development.md) | CherryUI ownership and reusable React component composition |

## References

References describe the current architecture, terminology, constraints, and measured behavior.
They are the source of truth for how the repository works today.

### Architecture And Conventions

| Document | Description |
| --- | --- |
| [Architecture Overview](./references/architecture-overview.md) | Runtime model, source ownership, dependency boundaries, and frontend/backend interfaces |
| [Code Organization](./references/code-organization.md) | Module placement, domain promotion, layer ownership, and public surfaces |
| [Domain Language](./references/domain-language.md) | Shared product and architecture terminology |
| [Naming Conventions](./references/naming-conventions.md) | File, directory, identifier, and documentation naming rules |
| [Runtime Ownership](./references/runtime-ownership.md) | Bootstrap, app runtimes, caller-owned sessions, cleanup, and post-ready work |
| [Universal Package](./references/universal-package.md) | `@cherrystudio/universal` scope, admission criteria, aliasing, and desktop sync |
| [Navigation And Insets](./references/navigation-and-insets.md) | Router structure, native gestures, sheets, safe areas, and edge-to-edge layout |
| [Interaction And Gesture Arbitration](./references/interaction-and-gesture-arbitration.md) | Target contract for tap, long press, scroll, app-defined pan, and native text selection (`Status: design`) |
| [Splash Screen And Startup Animation](./references/splash-screen-and-startup-animation.md) | Native launch constraints, animated handoff, and onboarding boundaries |
| [UI Components](./references/ui-components.md) | Interaction component ownership and platform enhancement rules |
| [Expo UI Bottom Sheet Navigation](./references/expo-ui-bottom-sheet-navigation.md) | Sheet page transitions, physical stacking, and platform constraints |
| [Design Spec](../DESIGN.md) | Visual decisions: token sourcing, contrast, type scale, hierarchy, and the literal-colour exemptions |

### Product Systems

| Document | Description |
| --- | --- |
| [Agent Architecture](./references/agent/README.md) | Implemented Agent Host, Pi Runtime, persistence, tools, and current boundaries |
| [AI Provider Integration](./references/ai/provider-integration.md) | Pi Agent provider resolution and non-conversation AI SDK generation |
| [Provider Serving Boundaries](./references/ai/provider-serving-boundaries.md) | Shared Provider connection facts and capability-specific language and image execution boundaries |
| [Chat Streaming And Rendering](./references/chat/streaming-and-rendering.md) | Agent Session streaming, message windows, persistence, and rendering boundaries |
| [Data Layer](./references/data/README.md) | Data API, preferences, caches, SQLite ownership, and service composition |
| [File Model](./references/data/file-model.md) | Sandbox file ownership, immutability, references, lifecycle, and user-triggered deletion |
| [Job Runtime](./references/job-runtime.md) | Durable job ledger, dispatch, cancellation, recovery, and painting generation |
| [Lifecycle](./references/lifecycle/README.md) | Service host, startup phases, teardown, and resource-scope coordination |
| [Storage Engine](./references/data/storage-engine.md) | Current SQLite engine, workarounds, and migration criteria |
| [Web Search](./references/web-search.md) | External search providers and provider-native web search |

## Documentation Governance

- Put task-oriented procedures under `docs/guides`.
- Put current technical facts, rules, and constraints under `docs/references`.
- A reference may describe a design that is not yet built, but only when it carries a
  `Status:` line naming its state (`design`, `as-built`, `Phase N landed`) and it does not
  overwrite the current-state description of anything it will replace. Current-state references
  change in the same PR as the code, never ahead of it — a reference that describes an intended
  future as if it were present is the one failure mode this rule exists to prevent. Promote a
  design document to current-state prose as each phase lands, and record superseded decisions as
  explicit deviations rather than silent edits.
- Keep module-specific `README.md` files beside the code they describe and link to these documents
  for repository-wide rules.
- Do not add ADR or TODO directories. Git history preserves superseded decisions; unfinished work
  belongs in the project issue tracker rather than current-state documentation.
- Update references in the same change as the behavior or structure they describe.
- Write project documentation in English and keep relative Markdown links valid.
