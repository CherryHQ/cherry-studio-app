# Scope Matrix

[desktop-sync-manifest.json](../../../../desktop-sync-manifest.json) owns the domain inventory,
paths, baselines, exclusions, shape-only ports, and Mobile extensions. Read its current entries
instead of duplicating path lists here. The design manifest separately owns icon-source and
generated-asset provenance; Mobile tokens and CSS have no desktop baseline.

## Current Domains

| Domain | Admission and ownership |
| --- | --- |
| `design-catalog` | Desktop icon sources with Mobile asset/catalog adapters; no token mirroring |
| `shared-portable` | Remaining portable types/helpers admitted by current package consumers |
| `ai-core` | Selected provider and non-conversation AI SDK behavior; semantic port |
| `ai-sdk-provider` | Provider transports consumed by Mobile's AI SDK path; semantic port |
| `provider-registry` | Catalog semantics with a static Mobile loader and explicit compatibility review |
| `shared-ai` | Portable vocabulary/helpers with current package consumers; preserve declared trims |
| `services` | Selected behavior reached by Mobile composition roots; retain Mobile adapters |
| `dependencies` | Versions/patches needed by admitted behavior; preserve Expo-compatible resolution |

The old `schema`, `shared-data`, `data-main`, `data-renderer`, `ai-runtime`, and `backup` domains
are retired. Mobile data and conversation execution are independent. Do not recreate those domains
or require desktop-only tables and APIs as incidental sync work. The private Mobile package named
`ai-runtime` still exists; it is not the retired whole-desktop-runtime synchronization domain.

## Classification Rules

- `mirror`: exact sources explicitly required to match, such as SVG assets; not whole AI packages.
- `semantic-port`: admitted public behavior preserved through its owning Mobile boundary.
- `mobile-extension`: a Mobile product/platform requirement documented alongside shared behavior.
- `opaque-retention`: existing persisted values that a supported import or mutation must preserve;
  not a blanket requirement to add every desktop schema.
- `explicit-exclusion`: deliberate non-admission supported by consumer and ownership evidence.
  Record relevant path exclusions in the manifest when its audited inventory changes.
- `blocked`: admitted behavior cannot be implemented or proved, or a required compatibility
  decision remains unresolved. State the impact, evidence, and smallest needed decision.

Classify every changed concept in the selected scope. Lack of a current Mobile consumer is a valid
reason not to admit desktop code; verify imports rather than inferring from names. Preserve
registered trims and exclusions unless evidence justifies changing them. Do not advance a domain
baseline while a selected change is unclassified or blocked.

## Architecture Boundaries

Apply [Desktop AI Reuse](../../../../docs/references/ai/desktop-package-reuse.md) and
[Universal Package](../../../../docs/references/universal-package.md). Pi owns conversation
execution; Mobile owns its host, adapters, persistence, tools, and lifecycle. AI SDK transforms do
not become Pi behavior merely because they target the same provider. An audit hash observes source
drift; it does not prove consumer behavior or authorize a registry compatibility-version increase.
