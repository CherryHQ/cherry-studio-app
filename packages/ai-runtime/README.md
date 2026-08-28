# AI Runtime

Portable provider, message, tool, and auxiliary AI behavior originally ported from Cherry Studio
desktop.

Despite the package name, this package is not Cherry Mobile's Agent Runtime. Pi is the sole local
conversation engine; these exports serve provider connection facts and the non-conversation AI SDK
path.

This package is being dissolved into `src/backend/ai`. Desktop alignment is retired as an
implementation constraint, and the desktop-sync provenance workflow that used to govern this
package was retired with it (2026-08-28). Do not add new modules here; see
[Backend AI Target Architecture](../../docs/references/ai/target-architecture.md) for the target
ownership and migration status.

## Interface

Consumers use only the declared `messages`, `provider`, `runtime`, `tools`, and `utils` subpaths.
Expo, React Native, app services, storage, device APIs, and application logging stay in backend
adapters.
