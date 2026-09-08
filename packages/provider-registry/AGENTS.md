# provider-registry — module instructions

The bundled AI **provider + model catalog**. This package has two faces:

- **Build-time**: a generation pipeline (`src/creators/` + `src/providers/` + `scripts/generate-catalog.ts`) that emits the three `data/*.json` files.
- **Runtime**: schemas and lookup utilities, with `registry-loader.ts` for Node consumers and
  the static `mobile-loader.ts` entry for the app's Metro bundle.

Full architecture: [docs/architecture.md](docs/architecture.md). Consumer API: [README.md](README.md).

## Cardinal rule — NEVER hand-edit `data/*.json`

`data/models.json`, `data/providers.json`, `data/provider-models.json` are **PURE GENERATED ARTIFACTS**. Do not edit them by hand: regeneration overwrites manual changes. Source-sync and catalog-invariant tests protect generated facts, but there is no separate CI job that rejects every data-only diff.

To change the catalog, edit the **source** and regenerate:

| You want to change… | Edit | Then |
| --- | --- | --- |
| a model's metadata (capabilities, modalities, context/limits, name) | `src/creators/<creator>.ts` | `pnpm generate` |
| how a provider connects / which models it serves / its pricing & overrides | `src/providers/<provider>.ts` | `pnpm generate` |

`pnpm generate` reads upstream catalogs (models.dev / OpenRouter text + image models) **live**; set `MODELSDEV_CACHE` / `OPENROUTER_CACHE` / `OPENROUTER_IMAGE_CACHE` to local files to cache them during dev. Commit source changes with their regenerated artifacts. An intentional upstream-only refresh may produce a data-only diff; explain its provenance in review.

## Source of truth

- **`src/creators/<creator>.ts`** — model **creators** (anthropic, openai, cohere, alibaba, …). Declares *what models exist* and their *intrinsic metadata*. Built with `defineCreator`. A creator is the home for capabilities/modalities/context — **creator owns metadata**.
- **`src/providers/<provider>.ts`** — serving **providers** / gateways / clouds (dashscope, ppio, tokenhub, openrouter, aws-bedrock, …). Declares *how to connect* and *which models it serves* with per-provider `apiModelId`, pricing, and overrides. Built with `defineProvider` / `openaiCompatible` — **provider owns parameter support** (endpoints/transport, per-provider param sets).
- **models.dev + OpenRouter** — read live at generation time to enrich metadata/pricing for the models the registry references (not committed; `pnpm generate` fetches them).

## Rules when editing source

- **Hand-list models with full metadata.** A creator model is `{ id, name, capabilities, … }` — never a bare `{ id }`. Add `name` + the relevant `capabilities` / `contextWindow` / `maxOutputTokens` / modalities; without them the model resolves with no capabilities.
- **`imageGeneration`: creator carries `supports` (the param vocabulary) as the provider-agnostic DEFAULT; the provider carries `vendorTransport` (endpoint routing).** The runtime **replaces** `imageGeneration` wholesale (it does not deep-merge), so a model-level block must never contain a provider-specific `vendorTransport`, and any provider needing a custom endpoint restates the **full** block (supports + transport). See [docs/architecture.md#image-generation-design-b](docs/architecture.md#image-generation-design-b).
- **`idPrefixes` must be vendor-specific.** A prefix claims every catalog id matching it, so a generic prefix (`rerank`, `embed`) will mis-attribute other vendors' models. Use the creator's own namespace (`rerank-v`, `command`, `c4ai`, …).
- **A provider override whose `modelId` is not a base model must carry a standalone `name`** (vendor-exclusive). The catalog-invariants test fails on a dangling override (a `modelId` that is neither in `models.json` nor a named standalone).

## Verify (required before commit)

```bash
pnpm --filter @cherrystudio/provider-registry generate   # regenerate data/*.json from source + live upstream
pnpm --filter @cherrystudio/provider-registry test        # vitest: schema conformance + catalog invariants
```

Commit regenerated `data/*.json` alongside the source changes. Generation re-pulls live upstream,
so inspect and explain additional metadata/pricing drift. The `catalog-source-sync` test re-derives
source-controlled facts (provider configuration, hand-listed model presence/ownership/names, and
provider overrides) and compares them with committed JSON without fetching upstream. It runs through
the package's Vitest command locally and root Jest's Vitest shim in PR CI. Upstream-enriched fields
and overall correctness additionally rely on schema/catalog-invariant tests and code review.
See [Testing And CI](../../docs/guides/testing-and-ci.md) for the actual CI boundary.
