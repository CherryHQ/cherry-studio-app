# Cherry Studio Mobile Documentation

This directory is the entry point for project-owned documentation.

## Guides

Guides are task-oriented procedures for changing or extending the application.

| Document | Description |
| --- | --- |
| [Extending Cherry Mobile](./guides/extending.md) | Add resource endpoints, workflows, persistence, backend behavior, and UI |

## References

References describe the current architecture, terminology, constraints, and measured behavior.
They are the source of truth for how the repository works today.

### Architecture And Conventions

| Document | Description |
| --- | --- |
| [Architecture Overview](./references/architecture-overview.md) | Runtime model, source ownership, dependency boundaries, and frontend/backend interfaces |
| [Domain Language](./references/domain-language.md) | Shared product and architecture terminology |
| [Naming Conventions](./references/naming-conventions.md) | File, directory, identifier, and documentation naming rules |
| [Runtime Ownership](./references/runtime-ownership.md) | Bootstrap, startup gates, sessions, cleanup, and post-ready work |
| [Navigation And Insets](./references/navigation-and-insets.md) | Router structure, native gestures, sheets, safe areas, and edge-to-edge layout |
| [UI Components](./references/ui-components.md) | Interaction component ownership and platform enhancement rules |

### Product Systems

| Document | Description |
| --- | --- |
| [AI Provider Integration](./references/ai/provider-integration.md) | Provider/model resolution, AI SDK adapters, options, and transport behavior |
| [Chat Streaming And Rendering](./references/chat/streaming-and-rendering.md) | Streaming sessions, message windows, persistence, and rendering boundaries |
| [Data Layer](./references/data/README.md) | Data API, preferences, caches, SQLite ownership, and service composition |
| [Storage Engine](./references/data/storage-engine.md) | Current SQLite engine, workarounds, and migration criteria |
| [Web Search](./references/web-search.md) | External search providers and provider-native web search |

### Performance

| Document | Description |
| --- | --- |
| [Topic Rendering Benchmark](./references/performance/topic-rendering-benchmark.md) | Historical baseline, fixture matrix, and current comparison criteria |

## Documentation Governance

- Put task-oriented procedures under `docs/guides`.
- Put current technical facts, rules, and constraints under `docs/references`.
- Keep module-specific `README.md` files beside the code they describe and link to these documents
  for repository-wide rules.
- Do not add ADR or TODO directories. Git history preserves superseded decisions; unfinished work
  belongs in the project issue tracker rather than current-state documentation.
- Update references in the same change as the behavior or structure they describe.
- Write project documentation in English and keep relative Markdown links valid.
