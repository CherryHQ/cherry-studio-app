# Naming Conventions

> Version: 2.2
> Last Updated: 2026-07
> **This document is the authoritative source for repository naming rules.**

This document defines naming rules for files, directories, and identifiers across the Cherry Studio mobile app (Expo / React Native). It encodes both industry consensus (React/TypeScript, Node.js) and project-specific conventions. Toolchain-binding rules come from Expo Router (file-based routing) and React Native (Metro platform-extension resolution) — not shadcn or Next.js.

---

## Table of Contents

1. [Quick Reference](#1-quick-reference)
2. [Core Principles](#2-core-principles)
3. [File Naming](#3-file-naming)
4. [Directory Naming](#4-directory-naming)
5. [Identifier Naming](#5-identifier-naming)
6. [Edge Cases](#6-edge-cases)
7. [Decision Tree](#7-decision-tree)
8. [Appendix: References](#appendix-references)

---

## 1. Quick Reference

The 90% case. See later sections for full rules and edge cases.

| What you're naming | Convention | Example |
|---|---|---|
| Business React component file | `PascalCase.tsx` | `HeaderIconButton.tsx`, `ChatScreen.tsx` |
| Platform-specific component file (RN) | `PascalCase.ios.tsx` / `PascalCase.android.tsx` | `MainHeader.ios.tsx`, `SearchScopeTabs.android.tsx` |
| Expo Router route file (`src/app/`) | `kebab-case.tsx` + reserved tokens | `api-key-settings.tsx`, `_layout.tsx`, `index.tsx` |
| Hook file | `useXxx.ts(x)` (camelCase, `use` prefix) | `useMessages.ts` |
| Util / function file (function-as-default-export) | `camelCase.ts` | `messageQueryOptions.ts` |
| Class-as-default-export file | `PascalCase.ts` (matches class name) | `AssistantService.ts`, `ChatSessionImpl.ts` |
| Test file | `*.test.ts(x)` | `rowMappers.test.ts` |
| Config file | `*.config.{ts,js}` | `metro.config.js`, `drizzle.config.ts` |
| Type declaration | `*.d.ts` (lowercase / kebab) | `expo-env.d.ts` |
| Repository meta doc | `UPPERCASE.md` | `README.md`, `AGENTS.md` |
| Documentation guide or reference | `kebab-case.md` | `extending.md`, `architecture-overview.md` |
| npm package directory (`packages/*`) | `kebab-case` | `ai-sdk-provider/` |
| Business React component directory | `PascalCase` | `MainHeader/`, `ScrollToBottomButton/` |
| Bucket directory (categorical container) | lowercase **plural** noun | `services/`, `hooks/`, `schemas/` |
| Business / domain module directory | `camelCase` | `assistantPicker/`, `webSearch/` |
| Large multi-file domain subtree | `src/frontend/features/<name>/` (route-bound) or `camelCase/` (under an owning bucket) | `frontend/features/chat/`, `integrations/webSearch/` |
| `packages/ui/` (icon registry) directory | `kebab-case` | `icons/`, `icons-png/` |

> Stateful classes use only `Service` (default) or `Manager` (instance pool) — see §5.2. Files placed inside any `utils/` directory drop the `Utils` suffix — the directory already declares the role; see §3.2. React Native platform-divergent files carry a `.ios`/`.android` suffix on the base name — see §3.8.

---

## 2. Core Principles

Three rules trump any specific table below when in conflict:

1. **Consistency beats style choice.** A directory that consistently uses a "suboptimal" convention is healthier than one mixing two "correct" conventions.
2. **Cross-platform case safety.** Never rely on case to distinguish two files (e.g. `Foo.ts` and `foo.ts` in the same directory). macOS/Windows are case-insensitive by default; Linux is case-sensitive. Mixing breaks CI.
3. **Toolchain constraints win.** npm package names, Expo Router file-route conventions, and React Native platform-extension resolution (`.ios`/`.android`) are hard requirements — they override stylistic preference.

---

## 3. File Naming

### 3.1 React Component Files (`.tsx`)

| Location | Convention | Rationale |
|---|---|---|
| `src/frontend/components/**` | `PascalCase.tsx` | Filename mirrors the exported component name. |
| `src/frontend/features/**` | `PascalCase.tsx` | Filename mirrors the exported component name. |
| `src/app/**` (Expo Router routes) | `kebab-case.tsx` + reserved tokens | Filename maps to the route/navigation; see §6.6. |

The component's **exported identifier** is always `PascalCase`, regardless of filename style:

```tsx
// src/frontend/features/chat/ChatScreen.tsx
export function ChatScreen() { /* ... */ }

// src/frontend/components/headers/components/HeaderIconButton.tsx
export function HeaderIconButton() { /* ... */ }
```

Route files under `src/app/` keep kebab-case / reserved-token filenames (§6.6) but their default export is still a `PascalCase` screen component.

### 3.2 TypeScript Source Files (`.ts`)

Choose based on **what the file's default / primary export is**:

| Primary export | Convention | Example |
|---|---|---|
| Hook function (`useXxx`) | `camelCase.ts(x)`, must start with `use` | `useMessages.ts` |
| Plain function or function group | `camelCase.ts` | `messageQueryOptions.ts`, `rowMappers.ts` |
| Class (especially services) | `PascalCase.ts` (matches class name) | `AssistantService.ts`, `ChatSessionImpl.ts`, `DbService.ts` |
| Constants / enums only | `camelCase.ts` | `errorCodes.ts` |
| Re-export barrel | `index.ts` | — |

**Note:** Files under `packages/ui/` (and other publishable `packages/*`) use `kebab-case.ts` regardless of export type (e.g. `provider-aliases.ts`, `model-aliases.ts`), per §4.6 — that scope-specific rule overrides this section. The exported identifier (e.g. `providerAliases`) remains `camelCase`.

**Inside any `utils/` directory** — the directory declares the role, so the filename does not repeat it:

```
utils/orderKey.ts      ✅
utils/rowMappers.ts    ✅
utils/messageQueryOptions.ts  ✅
```

A `*Utils` suffix is used only when the file lives outside any `utils/` directory.

**Hooks (`useXxx.ts`)** — are co-located with their owning feature by default (e.g.
`src/frontend/features/chat/input/hooks/`). A hook moves to `src/frontend/hooks/` only when
independent feature or screen domains consume it; cross-domain hooks may group into a domain folder
such as `src/frontend/hooks/chat/`. A hook that embeds JSX in its return value uses the `.tsx`
extension (e.g. `useConfirmDialog.tsx`); a hook with no JSX uses `.ts`.

**Utilities** — pure helpers stay in the owning module's `utils/` by default. A helper shared by
independent modules moves to the narrowest owning layer: `src/frontend/utils`, `src/backend/utils`,
or `src/shared/utils` when both layers consume it. There is no root `src/utils`. Multiple imports
inside one screen tree do not establish cross-domain reuse.

**Native module wrappers** — wrappers around custom native modules (under `modules/`, e.g. `modules/pdf-text-extractor/`) or Expo modules carry no `*Api`, `*Client`, or `*Bridge` suffix. Categorize them by module shape per §5.2 (a stateful wrapper → `Service`/`Manager`; a pure-function set → `utils/`).

### 3.3 Test Files

- **Suffix**: `*.test.ts` or `*.test.tsx`. Do **not** use `.spec.*`.
- **Location**: prefer co-location in `__tests__/` subdirectory next to source. Inline (`foo.ts` + `foo.test.ts` in same dir) is also acceptable.
- **Filename base**: match the file under test (`rowMappers.ts` → `rowMappers.test.ts`).

### 3.4 Config Files

- Pattern: `*.config.ts` (or `*.config.js` / `*.config.mjs` when TS is unsupported).
- Examples: `metro.config.js`, `babel.config.js`, `drizzle.config.ts`, `jest.config.js`.
- Tool-mandated root config names (`app.json`, `eas.json`, `tsconfig.json`) keep their required names; do not customize.

### 3.5 Type Declaration Files

- Pattern: `*.d.ts`, all-lowercase or `kebab-case`.
- Examples: `expo-env.d.ts`, `global-types.d.ts`.

### 3.6 Markdown / Documentation

| Type | Convention | Example |
|---|---|---|
| Repository meta docs at root | `UPPERCASE.md` | `README.md`, `AGENTS.md` |
| Directory index | `README.md` (always uppercase) | `docs/README.md`, `src/frontend/components/README.md` |
| Task-oriented guide under `docs/guides` | `kebab-case.md` | `extending.md` |
| Current-state reference under `docs/references` | `kebab-case.md` | `architecture-overview.md`, `naming-conventions.md` |
| Package-local documentation | `kebab-case.md` except directory indexes | `architecture.md`, `provider-aliases.md` |

`docs/README.md` is the repository documentation entry point. Guides explain how to perform a task;
references describe current behavior, terminology, constraints, or measurements. Do not create ADR
or TODO documentation trees. Git history preserves superseded decisions, and unfinished work belongs
in the project issue tracker. Module-specific `README.md` files remain beside their code.

### 3.7 JSON / YAML / TOML

- `package.json`, `tsconfig.json`, `app.json`, `eas.json`, `pnpm-workspace.yaml`: tool-mandated names; do not customize.
- Project-specific config JSON: `kebab-case.json`.

### 3.8 Platform-Specific Files (`.ios` / `.android`)

A component or module with platform-divergent implementations splits via Metro's platform-extension resolution:

```
MainHeader/
├── MainHeader.tsx          # shared API / types / fallback (optional)
├── MainHeader.ios.tsx      # iOS implementation
└── MainHeader.android.tsx  # Android implementation
```

- The **base name** keeps its normal casing — `PascalCase` for components (§3.1), `camelCase` for `.ts` modules (§3.2). The `.ios` / `.android` segment is the platform selector, not part of the name.
- Applies to both `.tsx` and `.ts` (`Foo.ios.ts`, `Foo.android.ts`).
- These are **not** §6.3 case/duplicate violations — Metro resolves exactly one variant per platform at build time.
- Examples: `MainHeader.{ios,android}.tsx`, `BackHeader.{ios,android}.tsx`, `ScrollToBottomButton.{ios,android}.tsx`, `SearchScopeTabs.{ios,android}.tsx`.

---

## 4. Directory Naming

Directory naming splits into category rules (§4.1–§4.3, §4.5–§4.7, §4.10) and cross-cutting rules: §4.4 (file vs subdirectory), §4.8 (top-level closed), §4.9 (singular vs plural).

### 4.1 npm Package Directories — `kebab-case`

`packages/*` directory names must be `kebab-case`. The directory name must equal the `name` field in `package.json` (minus the scope prefix).

```
packages/ai-sdk-provider/     ✅
packages/lucide-uniwind/      ✅
packages/provider-registry/   ✅
packages/somePkg/             ❌ (camelCase not allowed)
packages/SomePkg/             ❌ (PascalCase not allowed)
```

> The dir name equals the unscoped package name: `packages/ui/` publishes `@cherrystudio/ui`; `packages/ai-core/` publishes the matching `ai-core` name. See §6.5.

### 4.2 Business React Component Directories — `PascalCase`

When a directory **is** a component (i.e. contains `index.tsx` exporting the component, or groups files under one component name), use `PascalCase`.

```
src/frontend/components/headers/MainHeader/                       ✅
src/frontend/components/headers/BackHeader/                       ✅
src/frontend/features/chat/workspace/components/ScrollToBottomButton/  ✅
```

### 4.3 Bucket Directories — `lowercase plural noun`

"Bucket" = a categorical container holding many unrelated items of the same kind.

```
services/   utils/   hooks/   components/   features/   types/   schemas/
```

Bucket names are **plural** (see §4.9 for singular-vs-plural rules across all directory kinds). Do **not** invent variants like `Services/` or `helpers-and-utils/`.

### 4.4 File-Level vs Subdirectory Organization Inside a Bucket

Inside any bucket or domain directory, a **single file is the default**. Promote to a subdirectory only when the topic requires multiple files.

| Situation | Layout | Examples |
|---|---|---|
| One file can express the entire capability / topic | One `.ts` file | `data/services/TagService.ts`, `utils/orderKey.ts`, `hooks/chat/useMessages.ts` |
| Implementation is too large for one file, **or** the topic owns several closely related artifacts (helpers, types, sub-files) that belong together | A subdirectory grouping the files | `services/webSearch/`, `components/modelPicker/`, `features/chat/input/` |

Do not pre-create a subdirectory for anticipated growth — promote only when the second file actually arrives.

### 4.5 Business / Domain Module Directories — `camelCase`

When a directory represents a **named domain** (a coherent business module with its own internal structure), use `camelCase`.

```
src/frontend/components/confirmDialog/                      ✅
src/frontend/components/modelPicker/                        ✅
src/backend/services/webSearch/                             ✅
src/backend/services/permissions/                           ✅
```

Placement — whether a domain module lives as a large subtree or as a subdirectory inside a bucket like `services/` — is governed by §4.10; this section governs only its name.

### 4.6 `packages/ui` (icon registry) Directories — `kebab-case`

Everything inside `packages/ui/` (both files and directories) uses `kebab-case` for package-local consistency. `packages/ui` (`@cherrystudio/ui`) is the shared **icon registry**, not a shadcn component library:

```
packages/ui/src/icons/        ✅
packages/ui/src/icons-png/    ✅
packages/ui/src/icons-png/provider-aliases.ts   ✅
```

The other publishable packages (`ai-sdk-provider/`, `provider-registry/`, `lucide-uniwind/`) follow the same package-local `kebab-case` for their files.

### 4.7 Convention-Mandated Directories

These have fixed names dictated by tools or community convention:

| Directory | Purpose |
|---|---|
| `__tests__/` | Test files (Jest convention) |
| `__mocks__/` | Mock files (Jest convention) |
| `node_modules/` | Dependencies (npm/pnpm) |
| `ios/`, `android/` | Native project dirs (Expo prebuild / bare) |
| `dist/`, `build/`, `out/` | Build output |

### 4.8 Top-Level Directories — Closed by Default

The set of top-level directories under each of:

- repository root `/`
- `/src/`

is **closed by default**. The current `/src/` roots are `app/`, `bootstrap/`, `frontend/`, `backend/`,
`shared/`, and `types/`. Their ownership is also closed:

- `frontend/`: `components/`, `data/`, `features/`, `hooks/`, `i18n/`, `styles/`, `types/`, and
  `utils/`.
- `backend/`: `ai/`, `data/`, `services/`, `types/`, and `utils/`.
- `shared/`: `ai/`, `contracts/`, `core/`, `data/`, and `utils/`.

Adding a root or overlapping one of these layer-owned buckets is a structural commitment governed by
the [Architecture Overview](./architecture-overview.md).

**A new top-level directory MAY be added only when the PR description establishes both:**

1. **Necessity** — no existing top-level bucket can host the new files without semantic loss.
2. **Completeness** — the new directory has a clear scope, follows §4.3 (plural bucket) or §4.5 (singular domain module) form, and does not overlap with any existing bucket.

If either is in doubt, place the files inside an existing bucket. Subdirectories under existing buckets are unrestricted.

For the architecture rationale behind these roots, see the
[Architecture Overview](./architecture-overview.md) and its linked area references.

### 4.9 Singular vs Plural

Choose number based on what the directory **conceptually contains**, not on which sounds nicer.

| Directory role | Number | Examples |
|---|---|---|
| **Collection bucket** — holds many items of the same kind | **plural** | `services/`, `utils/`, `hooks/`, `components/`, `features/`, `types/`, `schemas/`, `providers/`, `presets/` |
| **Namespace / theme** — represents one subject area, not a collection | **singular** | `config/`, `data/`, `core/`, `api/`, `runtime/` |
| **Business / domain module** — named action or concept | **singular** (default) | `webSearch/`, `assistantPicker/`, `devicePermissions/`, `bootstrap/` |
| **Component directory** (dir = component) | follows the **component name** | `MainHeader/`, `McpScreen/` (singular component); `SettingsSection/` (component representing a group) |

Decision rule: ask "does this directory hold **many of X**?" — yes → plural; no → singular. When two readings both make sense, pick the one that matches the directory's **default import name** (e.g. `import { ... } from './config'` reads naturally with `config/` singular).

### 4.10 Large Multi-File Domains — Subtree vs Type Buckets

A **large multi-file domain** co-locates *everything* it owns — its components or services, domain-local `utils/` and `hooks/`, context, and sub-components — in one subtree, instead of scattering them across the top-level buckets.

**A domain earns its own subtree only when it is large, complex, and multi-file** — cohesion alone is not enough (this is §4.4 applied at the top level).

| The domain is… | Home | Layout |
|---|---|---|
| A large route-bound UI domain | `src/frontend/features/<name>/` | self-contained tree (`input/`, `workspace/`, `components/`, `hooks/`, `utils/`) |
| A large shared UI domain | `src/frontend/components/<domain>/` | self-contained tree |
| A large backend service domain | `src/backend/services/<domain>/` | service, adapter, provider, and utility subtree |
| One cohesive persistence service | `src/backend/data/services/<Domain>Service.ts` | a single file; its lone helper stays in the nearest `utils/` |
| A small standalone helper | the owning module's or layer's `utils/` | a single file |

This is the §4.4 promotion rule applied at the top level: a domain graduates from "a file (plus maybe one util) in a bucket" to "its own subtree" only once the additional files actually arrive and span more than one concern. Do not pre-create a subtree for an anticipated module.

**Canonical example** — `src/frontend/features/chat/`:

```
src/frontend/features/chat/
├── ChatScreen.tsx        # the route-bound screen component (§3.1)
├── input/                # ChatInput + its components/hooks/utils
├── workspace/            # message list + scroll/layout sub-modules
├── messageContent/       # message part renderers
├── messageItem/          # user/assistant message items
└── session/              # React owner for the backend ChatSession
```

Layer-level buckets such as `frontend/components`, `frontend/hooks`, `backend/services`,
`backend/data/services`, and each layer's `utils` stay reserved for small, independent,
cross-domain pieces. A large, multi-file domain left scattered across those buckets instead of
gathered into one subtree is the §6.7 scattered/impure anti-pattern.

For UI modules, promotion is owner-based: keep the module under its screen until a second independent screen or feature domain consumes it. Import count inside one screen tree is not evidence of cross-domain ownership. App shell, design-system, and platform-adapter modules may be app-wide with one direct consumer, but must document that ownership and expose a stable public interface.

For how screen subtrees fit the navigation, data, and runtime layering, see the
[Architecture Overview](./architecture-overview.md).

### 4.11 Layer-Owned Data, Utils, And Types

Repeated bucket names across layers express different ownership; they are not candidates for a
root-level merge:

| Path | Ownership |
|---|---|
| `src/frontend/data` | `DataApiProvider`, `PreferenceProvider`, workflow `BackendProvider`, `QueryProvider`, endpoint query keys, data/preference/cache hooks, and frontend `CacheService` |
| `src/shared/data` | frontend/backend entities, DTO schemas, preferences, shared cache schemas, and data errors |
| `src/backend/data` | backend `CacheService`, `PreferenceService`, SQLite/Drizzle, seeders, fixtures, and persistence services |
| `src/frontend/utils` | pure helpers and constants used only by frontend modules |
| `src/backend/utils` | pure helpers and constants used only by backend modules |
| `src/shared/utils` | platform-independent pure helpers used by both frontend and backend |
| `src/frontend/types` / `src/backend/types` | declarations owned by one layer |
| `src/types` | truly global environment declarations and generated declarations only |

Choose the narrowest correct owner. A second consumer in another layer promotes a pure helper or
declaration to `shared`; it does not justify restoring root `src/utils` or putting layer-specific
declarations in root `src/types`.

---

## 5. Identifier Naming

Names inside source code — separate axis from filenames.

| Identifier kind | Convention | Example |
|---|---|---|
| Component, Class, Interface, Type alias, Enum type | `PascalCase` | `class AssistantService`, `interface UserConfig`, `type Status` |
| Variable, function, method, parameter | `camelCase` | `fetchUser`, `isReady` |
| Hook | `camelCase` with mandatory `use` prefix | `useMessages` |
| Constant, enum member | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`, `CHERRYIN_CONFIG` |
| Private class member | no `_` prefix; use `private` modifier | `private cache` |
| Generic type parameter | `PascalCase`, prefer descriptive | `<TItem>`, `<TError>` (avoid bare `T` for non-trivial cases) |

### 5.1 Singular vs Plural in Identifiers

| Identifier kind | Number | Example |
|---|---|---|
| Class, interface, type alias, enum type | **singular** | `User`, `OrderItem`, `LogLevel` (not `Users`, `OrderItems`) |
| Variable / property holding a single value | **singular** | `const user = ...`, `currentOrder` |
| Variable / property holding a collection (array, `Map`, `Set`) | **plural** | `const users = [...]`, `orderItems`, `connectedClients` |
| Boolean | no plural; use `is` / `has` / `can` / `should` prefix | `isReady`, `hasPermission`, `canEdit`, `shouldRetry` |
| Function returning one item | **singular** verb phrase | `getUser(id)`, `findOrder()` |
| Function returning many items | **plural** noun in name | `getUsers()`, `listOrders()`, `fetchPendingJobs()` |
| Function that mutates a collection | verb + plural object | `addUsers(...)`, `removeTags(...)` |
| Event / handler name | follows the event subject | `onMessageReceived` (one), `onItemsLoaded` (many) |

### 5.2 Suffix for Stateful Classes — `Service` (default) / `Manager` (instance pool)

A class that owns state, resources, or a lifecycle MUST use one of exactly two suffixes:

| Suffix | Use when the class… | Examples |
|---|---|---|
| `Service` | Provides a cohesive **domain capability / API surface**. The **default** for any stateful class. | `AssistantService`, `MessageService`, `CherryInOauthService`, `DbService` |
| `Manager` | Owns and coordinates a **pool / registry of many homogeneous instances**, and that coordination is its defining job. (Rare in this app — default to `Service` unless the pool-coordination is the point.) | `ConnectionManager`, `SubscriptionManager` |

**Decision rule:** ask "is this class's primary job to own and coordinate a *set of many like instances*?" — yes → `Manager`; otherwise → `Service` (default when unsure).

A `Service` / `Manager` class lives where its domain ownership lies (e.g.
`src/backend/data/services/MessageService.ts`,
`src/backend/services/oauth/CherryInOauthService.ts`,
`src/shared/core/logger/LoggerService.ts`); placement under a directory named `services/` is not
required.

**Stateless modules are NOT classes for this rule** — pure function collections, queries, conversions, and SDK wrappers without retained state do not receive a `Service` / `Manager` suffix.

**If a module looks like it wants to be a `Service` but is not actually a stateful class, it belongs elsewhere. Route by shape:**

| Actual shape of the module | Right home | Naming |
|---|---|---|
| Pure-function collection (queries, conversions, predicates, formatters) | `utils/` (or feature-local `utils/` subdirectory) | `<topic>.ts` (camelCase; no `Utils` suffix — see §3.2) |
| Depends on React lifecycle / state / context | `hooks/` (or co-located with the consuming feature) | `useXxx.ts(x)` (the `use` prefix is the role marker — see §3.2) |
| Renders JSX / owns view markup | `frontend/components/` (shared UI) or `frontend/features/` (route-bound) | `Xxx.tsx` (PascalCase — see §3.1) |
| Single-call pass-through to a native / Expo module | inlined at the call site | (no file) |

#### Two valid forms of a `Service`

The `Service` suffix names a **role** (a stateful domain capability), not a **mechanism**. A class earning the suffix may be implemented as either:

| Form | Pattern | Used when |
|---|---|---|
| Direct-import singleton | `export const xxxService = new XxxService()` (or a `static getInstance()` singleton) | The service holds class-level state but no externally-wired dependencies — e.g. `loggerService`, `providerRegistryService`, `CherryInOauthService`. |
| Factory-constructed service | instantiated by the bootstrap composition root — `createBackendServices(dbService)` | The service depends on a shared resource (the database) that must be injected and made ready before first use — e.g. `AssistantService`, `MessageService`, `TopicService`. |

There is no main-process DI container in the mobile app. `src/bootstrap` is the only composition root,
and readiness is coordinated by **startup gates**, not lifecycle phases. See
[Runtime Ownership](./runtime-ownership.md), the [Architecture Overview](./architecture-overview.md),
and [`src/bootstrap/README.md`](../../src/bootstrap/README.md).

### 5.3 Drizzle Schema Inferred Row Types

Every Drizzle table in `src/backend/data/db/schemas/` exports its inferred select/insert
types using the **`Row` suffix** form:

| Inferred from | Type name | Example |
|---|---|---|
| `xxxTable.$inferSelect` | `XxxRow` | `TopicRow`, `MessageRow` |
| `xxxTable.$inferInsert` | `InsertXxxRow` | `InsertTopicRow`, `InsertMessageRow` |

```ts
export const topicTable = sqliteTable('topic', { /* ... */ })

export type TopicRow = typeof topicTable.$inferSelect
export type InsertTopicRow = typeof topicTable.$inferInsert
```

`Row` names the raw database row and is deliberately distinct from the shared entity type to which
the backend service maps it. The `Xxx` stem matches the table-derived `xxxTable` const (see §3.2),
so `user_model` → `userModelTable` → `UserModelRow` / `InsertUserModelRow`.

Do **not** use the alternatives that previously coexisted here: `XxxSelect` / `XxxInsert`, `Xxx` /
`NewXxx`, or Drizzle's docs-style `SelectXxx` / `InsertXxx`. The `Row` suffix is chosen over Drizzle's
docs form precisely because it keeps the DB-row type visibly separate from the shared entity type.
Export the `Row` types from the schema file (and re-export them through `schemas/index.ts`) so backend
services consume them instead of re-deriving `typeof xxxTable.$inferSelect` locally.

---

## 6. Edge Cases

### 6.1 Acronyms and Initialisms

When an acronym (API, URL, ID, HTTP, MCP, AI, OAuth) appears inside `PascalCase` or `camelCase`:

- **First letter uppercase, rest lowercase** — `HttpClient`, `UserId`, `ApiServer`, `McpService`, `Oauth`.
- **Never all-caps** — `HTTPClient`, `UserID`, `APIServer`, `OAuth` (as in `CherryInOAuth`) are forbidden.
- **At the start of `camelCase`** — entirely lowercase: `httpClient`, `userId`, `apiServer`.
- **Same form applies to filenames** — `McpService.ts`, not `MCPService.ts`; `CherryInOauth.tsx`, not `CherryInOAuth.tsx`.

### 6.2 Case-Only Renames

`git` on macOS defaults to `core.ignorecase=true`, which silently swallows pure case-change renames. Always use the two-step pattern:

```bash
git mv Foo.tsx _tmp_foo.tsx
git mv _tmp_foo.tsx foo.tsx
```

### 6.3 Two Files Differing Only in Case

Forbidden. `Button.tsx` and `button.tsx` in the same directory will break on case-insensitive file systems. (Platform-extension pairs like `Foo.ios.tsx` / `Foo.android.tsx` differ by the platform selector, not by case, and are allowed — see §3.8.)

### 6.4 Barrel / Index Files

- Use `index.ts` or `index.tsx` (always lowercase).
- A barrel must re-export only — no business logic.
- Prefer **named exports** in barrels; avoid `export default` re-export chains.
- Add a barrel only at a real module boundary used by routes, parent modules, sibling domains, or
  external callers. Do not create barrels for private `components/`, `hooks/`, or `utils/` buckets.
- External callers import the module root. Module internals import leaf files relatively and do not
  route internal dependencies back through their own public barrel.
- Keep the export surface narrow: export only the components, hooks, functions, and associated types
  that callers need.

### 6.5 Directory Name vs Package Name

In `packages/*`, the directory name and `package.json#name` (after stripping scope) must match exactly. Renaming one requires renaming the other.

### 6.6 Expo Router File-Based Routes

Files under `src/app/` map to routes/navigation by filename (Expo Router). Route basenames are **kebab-case** (e.g. `api-key-settings.tsx`); the tokens below are folder/file conventions, not free names.

| Token | Meaning |
|---|---|
| `_layout.tsx` | Layout route for the directory |
| `index.tsx` | Index route for the directory |
| `(group)/` | Route group — organizes without adding a URL segment (e.g. `(tabs)/`, `(messages)/`, `(search)/`) |
| `[param].tsx` / `[param]/` | Dynamic segment (e.g. `[providerId]/`) |
| `[...rest].tsx` | Catch-all segment |

The route file's default export is a `PascalCase` screen component (§3.1); the file and folder names follow these tokens and kebab-case.

### 6.7 Bucket Anti-Patterns

A bucket directory drifts toward unhealth when **any** of these accumulate:

1. **Singular name on a directory that holds many like items** — should be a §4.3 bucket but was misclassified as a §4.9 namespace.
2. **Impure contents** — files inside the bucket that do not match the bucket's declared kind (e.g. a directory named after one React pattern that also holds wrapper components which do not use that pattern).
3. **Thin bucket** — a top-level bucket holding 0–2 files for an extended period is usually an over-eager extraction; reconsider whether it should be a subdirectory inside an existing bucket (see §4.8).
4. **Overlapping scope** — two top-level buckets whose names could each plausibly host the same file. One of them is redundant or the boundary is ill-defined.

Any of these signals warrants a consolidation review.

---

## 7. Decision Tree

```
Naming a new FILE
├─ React component (.tsx)?
│  ├─ Platform-divergent?                 → PascalCase.ios.tsx / .android.tsx  (MainHeader.ios.tsx, §3.8)
│  ├─ Under src/app/ (Expo Router)?       → kebab-case.tsx + reserved tokens   (api-key-settings.tsx, _layout.tsx, §6.6)
│  ├─ Under packages/ui/ (icon registry)? → kebab-case.tsx                      (§4.6)
│  └─ Under frontend components/features? → PascalCase.tsx                      (HeaderIconButton.tsx, ChatScreen.tsx)
├─ React hook?                    → useXxx.ts(x)    (useMessages.ts; .tsx only if it returns JSX)
├─ Primary export is a class?     → PascalCase.ts   (AssistantService.ts)
├─ Primary export is function(s)? → camelCase.ts    (messageQueryOptions.ts)
├─ Type declaration?              → *.d.ts          (expo-env.d.ts)
├─ Test?                          → *.test.ts(x)
├─ Config?                        → *.config.{ts,js}
└─ Documentation?
   ├─ Repo meta or directory index? → UPPERCASE.md  (README.md, AGENTS.md)
   └─ Guide, reference, or package doc? → kebab-case.md (architecture-overview.md)

Naming a new DIRECTORY
├─ npm package (packages/*)?      → kebab-case      (ai-sdk-provider)
├─ Under packages/ui/?            → kebab-case      (icons, icons-png)
├─ Is itself a React component?   → PascalCase      (MainHeader, ScrollToBottomButton)
├─ Bucket / categorical container? → lowercase plural noun  (services, hooks, schemas)
├─ Large route-bound UI domain?   → src/frontend/features/<name>/       (frontend/features/chat; §4.10)
├─ Large non-route domain?        → camelCase under its owning layer    (integrations/webSearch; §4.10)
├─ Business domain module?        → camelCase       (assistantPicker, devicePermissions)
└─ Unsure singular vs plural?     → see §4.9
```

---

## Appendix: References

This document distills consensus from:

- [Airbnb JavaScript Style Guide](https://github.com/airbnb/javascript) — file name matches default export
- [Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html)
- [Expo Router — file-based routing](https://docs.expo.dev/router/introduction/) — route file naming, route groups, dynamic segments
- [React Native — Platform-specific code](https://reactnative.dev/docs/platform-specific-code) — `.ios` / `.android` file extensions
- [typescript-eslint `naming-convention` rule](https://typescript-eslint.io/rules/naming-convention/)
