# Code Organization

This reference defines module placement, domain promotion, layer ownership, and public surfaces.
Use [Naming Conventions](./naming-conventions.md) after choosing the owner and location.

## Choose The Narrowest Owner

Keep code with the page, layer, or package that owns its behavior. Promote it only when a new
independent consumer creates a broader owner.

| Code | Owner |
| --- | --- |
| Expo Router adapter | `src/app` |
| Route-bound UI and orchestration | `src/frontend/features/<page>` |
| Component family shared by independent pages | `src/frontend/components/<Family>` |
| App-wide header, navigation, and startup integration | `src/frontend/appShell` |
| Frontend query, preference, and cache infrastructure | `src/frontend/data` |
| Backend AI adaptation | `src/backend/ai` |
| Backend persistence and Data API implementation | `src/backend/data` |
| Backend workflow, platform, and external capability | `src/backend/services` |
| Mobile-native pure contract or helper used by frontend and backend | `src/shared` |
| Desktop-mirrored portable AI contract or helper | `packages/universal` (dissolving; do not add new modules) |
| Reusable platform-neutral product interaction component | `packages/ui` |
| Global or generated declaration | `src/types` |

The repository and `src` top-level directory sets are closed by default. The current `src` roots are
`app`, `bootstrap`, `frontend`, `backend`, `shared`, and `types`. Add a new root only when no existing
owner can contain the capability without changing its meaning, and document its non-overlapping
scope in the PR.

## Build The Page Tree First

A page screen is the default owner of route-bound UI. Nest child page implementations beneath their
parent page instead of flattening them into domain-like siblings.

- Keep route-owned UI under its page until a second independent page consumes it. Multiple imports
  inside one page tree still have one owner.
- Put top-level pages under `src/frontend/features/<name>` and child pages beneath the owning parent,
  such as `src/frontend/features/settings/provider/detail`.
- Keep page-private components, hooks, context, utilities, and tests inside that page tree.
- Put a shared component family under `src/frontend/components/<Family>` only after a second
  independent page owner appears.
- Put a large backend capability under `src/backend/services/<name>`.
- Keep one persistence service in `src/backend/data/services`; keep a small helper in the nearest
  owning `utils` directory.
- App Shell modules may be app-wide with one direct consumer when they expose a stable boundary and
  document that ownership under `src/frontend/appShell`.

Page-specific UI remains with its page. A reusable interaction primitive belongs in CherryUI;
follow [UI Development](../guides/ui-development.md) before extracting or adding one.

## Respect Layer Ownership

Repeated bucket names express different owners:

| Path | Ownership |
| --- | --- |
| `src/frontend/data` | Frontend providers, endpoint query keys, data hooks, and UI cache state |
| `src/shared/data` | Mobile-owned entities, DTO schemas, preferences, cache schemas, and data errors |
| `packages/universal/src/data/types` | Transitional home of the entity types `packages/ai-runtime` still imports |
| `src/backend/data` | Backend cache, preferences, SQLite, migrations, and persistence services |
| `src/frontend/utils` | Pure helpers used by independent frontend domains |
| `src/backend/utils` | Pure helpers used by independent backend domains |
| `src/shared/utils` | Mobile-native pure helpers used by frontend and backend |
| `packages/universal/src/utils` | Desktop-mirrored portable helpers |
| `src/frontend/types`, `src/backend/types` | Declarations owned by one layer |
| `src/types` | Global environment and generated declarations only |

A second consumer in another layer may justify promotion to `shared`; it does not justify a root
`src/utils` bucket or layer-specific declarations in `src/types`. Keep concrete backend services out
of frontend state. See [Architecture Overview](./architecture-overview.md) for dependency direction
and [Runtime Ownership](./runtime-ownership.md) for long-lived resources.

## Expose Deliberate Public Surfaces

- Add `index.ts` or `index.tsx` only at a boundary consumed by routes, parent pages, sibling modules,
  or package users.
- A barrel contains named re-exports only and exposes the smallest interface callers need.
- External callers import the module root. Module internals import their leaf files directly and do
  not route dependencies back through their own barrel.
- Private `components`, `hooks`, and `utils` buckets do not need barrels.
- Route files remain thin adapters to exact page boundaries.

When choosing between `Module`, `Runtime`, `Session`, `Client`, `Adapter`, or `Manager`, use
[Runtime Ownership](./runtime-ownership.md#role-names).
