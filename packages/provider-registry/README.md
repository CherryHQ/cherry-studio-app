# @cherrystudio/provider-registry

Model catalog schemas, lookup utilities, and trusted provider connection definitions for Cherry Mobile.

> **Internal package — not published to npm.** The app resolves the package to `src/` directly.

## Mobile Catalog Ownership

The `/mobile` entry bundles only `data/providers.json`. Models and provider-model overrides come
from Cherry Desktop's published `x-files/provider-registry/v1` catalog. Model metadata fixes belong
upstream; Mobile maintains the reader, compatibility rules, and request adapters. User edits and
custom models stay in the local database and override downloaded defaults.

`ProviderRegistryUpdaterService` restores a validated snapshot from persistent document storage.
First use downloads a complete snapshot automatically; afterwards startup stays offline, and only
opening a provider's model list pulls a newer catalog. Two alternating files preserve the previous
snapshot if a write or update fails. Existing downloads from the older cache directory are migrated
after validation; app updates no longer invalidate data because a bundled model version changed.
Model workflows show loading/retry feedback until a snapshot is available. Welcome, provider
configuration, and history remain accessible.

Only compatible schema lanes and supported minimum runtime versions are accepted. Mobile's current
reader supports the Desktop 2.0.14 catalog semantics, including input-length pricing tiers, and
continues accepting older compatible snapshots. Provider endpoints and authentication definitions
remain release-owned. GitHub Models uses its provider API for discovery and remote base metadata;
there is no second bundled GitHub model list.

## Generator And Regression Fixtures

The source generator and `data/models.json` / `data/provider-models.json` remain available to Node
catalog tooling and existing regression suites. They are not imported by the app runtime and are
not an offline fallback. Tests that require catalog data install their fixture explicitly. Routine
Mobile model updates do not require regenerating or refreshing these files.

Generated artifacts must not be hand-edited. For a trusted provider connection change, edit
`src/providers/` and use `pnpm generate:providers`. See [AGENTS.md](AGENTS.md) and
[docs/architecture.md](docs/architecture.md) for the generator's ownership rules.

## Data Files

```
data/
  models.json            # Node tooling / regression snapshot; not bundled by Mobile
  providers.json         # Provider configurations (endpoints, API features)
  provider-models.json   # Node tooling / regression snapshot; not bundled by Mobile
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
