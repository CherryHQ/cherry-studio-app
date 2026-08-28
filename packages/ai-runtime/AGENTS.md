# AI Runtime Instructions

This package is dissolving into `src/backend/ai`; do not add new modules here. Read
[README.md](README.md) and
[Backend AI Target Architecture](../../docs/references/ai/target-architecture.md) before changing
source. Run `pnpm check` from this directory, keep platform behavior behind backend adapters, and
expose package behavior only through the five declared subpaths. Other package changes use the
relevant checks in [Testing And CI](../../docs/guides/testing-and-ci.md).
