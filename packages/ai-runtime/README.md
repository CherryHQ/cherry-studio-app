# AI Runtime

Provider adapters and AI SDK support for Cherry Mobile's non-conversation AI path: provider
connection facts, per-vendor request and transport shaping, model listing, AI SDK loop plumbing,
tool adapters, and usage capture.

Despite the package name, this is not Cherry Mobile's Agent Runtime. Pi is the sole local
conversation engine and lives in `src/backend/ai/agent/runtime/pi/`. What is here serves the AI SDK
path behind `AiService`, plus the connection facts Pi and the AI SDK share.

## Why this is a package

The code originated as a port from Cherry Studio desktop, and an earlier plan was to dissolve it
into `src/backend/ai`. A dependency-closure measurement (2026-08-28) retired that plan: 55 consumed
symbols pull in 84% of the package's non-test source, most of it per-vendor provider adaptation
(Ark, AiHubMix, DashScope, PPIO, Vertex, and the image wire profiles). Moving that into
`src/backend/ai/provider/` would have been a relocation, not a simplification — and per-vendor
adapters are exactly the kind of code a separate package holds well.

So the package stays, with an honest identity: it is the vendor-adaptation layer, not a migration
staging area. Desktop alignment is retired as an implementation constraint, and the desktop-sync
provenance workflow that governed this package was retired with it. Follow the mobile app's needs,
not desktop's structure.

## Boundaries

- Consumers use only the declared `provider`, `runtime`, `tools`, and `utils` subpaths. Anything
  reached through a deep path is an accident, not an interface.
- Expo, React Native, app services, storage, device APIs, and application logging stay in backend
  adapters. This package sees none of them.
- Conversation behavior does not belong here. If a change serves the chat turn, it belongs behind
  the Agent Runtime contract instead — see
  [Backend AI Target Architecture](../../docs/references/ai/target-architecture.md).
- Exports with no consumer are removed rather than kept for symmetry with desktop. The exception is
  `custom/wire/`: its vendor option mappings are covered by boundary tests that pin our request
  shaping against the upstream AI SDK packages, and they guard the image path that routes through
  those vendors.
