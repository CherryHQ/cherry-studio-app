# @cherrystudio/provider-registry

Bundled AI provider and model catalog for Cherry Studio: static JSON data files plus TypeScript schemas for reading them.

> **Internal package — not published to npm.** It's `private` and consumed only inside this monorepo (the app resolves it to `src/` directly; the main process reads `data/*.json` from the bundled resources). The imports below are for in-repo consumers via the workspace, not an external install.

> **Contributing?** The `data/*.json` files are **generated** — never hand-edit them. Edit `src/creators/` / `src/providers/` and run `pnpm generate`. See [CLAUDE.md](CLAUDE.md) and [docs/architecture.md](docs/architecture.md).

For a change limited to specific creator models, update only their generated base-model rows:

```bash
pnpm exec tsx scripts/generate-catalog.ts --write --model=gemini-3-1-flash-image --model=kolors
pnpm exec oxfmt data/models.json
```

Repeat `--model=<canonical-id>` for each model. This still enriches the selected rows from upstream,
preserves all other bundled rows, and updates the model catalog's content version. Provider overrides,
provider definitions, and reasoning patterns stay untouched; changes to those require full generation.

## Data Files

```
data/
  models.json            # Base model catalog (capabilities, limits, pricing)
  providers.json         # Provider configurations (endpoints, API features)
  provider-models.json   # Per-provider model overrides
```

## Usage

```typescript
import {
  readModelRegistry,
  readProviderRegistry,
  readProviderModelRegistry
} from '@cherrystudio/provider-registry/node'

const models = readModelRegistry('/path/to/models.json')
const providers = readProviderRegistry('/path/to/providers.json')
const overrides = readProviderModelRegistry('/path/to/provider-models.json')
```

## Schema Types

```typescript
import type {
  ProtoModelConfig,
  ProtoProviderConfig,
  ProtoProviderModelOverride,
  EndpointType,
  ModelCapability,
  Modality
} from '@cherrystudio/provider-registry'
```

## Build

```bash
pnpm build
```
