# AI Runtime Instructions

This package is the vendor-adaptation layer for the AI SDK path, not a staging area for migration
into `src/backend/ai`. Read [README.md](README.md) and
[Backend AI Target Architecture](../../docs/references/ai/target-architecture.md) before changing
source.

Run `pnpm check` from this directory. Keep platform behavior behind backend adapters, and expose
package behavior only through the four declared subpaths. New provider or transport adaptation
belongs here; anything that serves the conversation turn belongs behind the Agent Runtime contract
in `src/backend/ai/agent/runtime/`. Other package changes use the relevant checks in
[Testing And CI](../../docs/guides/testing-and-ci.md).
