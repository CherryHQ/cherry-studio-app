# Naming Conventions

This reference defines names for files, directories, and identifiers. Read
[Code Organization](./code-organization.md) for placement and public-surface rules, and
[Runtime Ownership](./runtime-ownership.md#role-names) before naming a stateful owner.

Common casing rules follow Cherry Desktop's Naming Conventions. Expo routes and mobile platform
variants retain their tool-specific forms. Choose names by the module's primary role, preserve
official product and SDK spellings, and follow established tool or library filename conventions.

## Files

| Location or role | Convention | Example |
| --- | --- | --- |
| Product React component under `src/frontend` | `PascalCase.tsx` | `ChatScreen.tsx` |
| JSX helper, registry, or variant module | `camelCase.tsx` | `sidebarVariants.tsx` |
| Expo Router route under `src/app` | `kebab-case.tsx` or a reserved route token | `api-key-settings.tsx`, `_layout.tsx` |
| Hook | `useXxx.ts` or `useXxx.tsx` when it returns JSX | `useMessages.ts` |
| Class | `PascalCase.ts` matching the class | `MobileAgentHost.ts`, `MinimaxImageModel.ts` |
| Function, constants, or function group | `camelCase.ts` | `messageQueryOptions.ts` |
| File under `packages/ui/**` | `kebab-case` regardless of primary export | `button.tsx`, `use-dnd-reorder.ts` |
| Re-export barrel | `index.ts` | named re-exports only |
| Test | matching base name plus `*.test.ts(x)` | `rowMappers.test.ts` |
| Config | `*.config.ts`, or JS/MJS when TypeScript is unsupported | `drizzle.config.ts` |
| Type declaration | lowercase or `kebab-case` plus `*.d.ts` | `expo-env.d.ts` |
| Root meta document or directory index | `UPPERCASE.md` | `AGENTS.md`, `README.md` |
| Guide, reference, or package-local document | `kebab-case.md` | `testing-and-ci.md` |

Only `packages/ui/**` requires `kebab-case` for every source filename. Other packages follow the
primary-export rules above: class files use `PascalCase`, function modules use `camelCase`, and
tests match their source filenames. Tool-mandated names, generator-owned paths, `README.md`, and
lowercase barrels such as `index.ts` keep their required spellings.

Tests use `.test.*`, not `.spec.*`, and normally live in a co-located `__tests__` directory. Files
inside `utils` do not repeat a `Utils` suffix.

## Platform Variants

When a React component needs different iOS and Android implementations, split it into matching
`Name.ios.tsx` and `Name.android.tsx` files. Non-JSX modules use the corresponding `.ios.ts` and
`.android.ts` suffixes. Place the complete platform family in a dedicated directory named after its
shared stem instead of placing platform siblings alongside unrelated files:

```text
Name/
├── Name.tsx
├── Name.ios.tsx
└── Name.android.tsx
```

Under `packages/ui/**`, apply the UI package naming rule to both directory and file stems, for example
`icon-glyph/icon-glyph.ios.tsx`. Keep shared types, APIs, and implementation in the same family
directory when both platform variants need them; Metro selects the platform file at build time.

## Directories

| Directory role | Convention | Example |
| --- | --- | --- |
| Package under `packages/*` | `kebab-case`, matching the unscoped package name | `ai-sdk-provider` |
| Directory under `packages/ui/**` | `kebab-case` | `bottom-sheet` |
| Component family | the `PascalCase` component name | `MainHeader` |
| Collection bucket | plural `camelCase` noun | `services`, `hooks`, `chatModels` |
| Business or domain module | singular `camelCase` name | `modelPicker`, `webSearch`, `aiSdk` |
| Namespace or subject | singular lowercase name | `config`, `data`, `runtime` |

Use tool-reserved directory forms unchanged, including Expo Router groups and dynamic segments such
as `(tabs)` and `[providerId]`.

## Identifiers

| Identifier | Convention | Example |
| --- | --- | --- |
| Component, class, interface, type alias, enum type | `PascalCase` | `AgentService`, `UserConfig` |
| Variable, function, method, parameter | `camelCase` | `fetchUser`, `currentOrder` |
| Hook | `camelCase` with a `use` prefix | `useMessages` |
| Constant and enum member | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT` |
| Boolean | `is`, `has`, `can`, or `should` prefix | `isReady`, `hasPermission` |
| Private class member | no underscore prefix; use `private` | `private cache` |
| Generic type parameter | descriptive `PascalCase` | `TItem`, `TError` |

Collection values and collection-returning functions use plural nouns; single values and types use
singular nouns.

For project-owned acronyms in `PascalCase` or `camelCase`, capitalize only the first letter:
`HttpClient`, `UserId`, `McpServer`, `httpClient`. Preserve official product, protocol, or SDK
spellings when a name mirrors that external concept, such as `OpenAIServiceTier`,
`Crawl4AIProvider`, or `PiOAuthProviderId`. Public shared contracts retain their upstream spelling.

Every Drizzle table in `src/backend/data/db/schemas` exports `XxxRow` and `InsertXxxRow` inferred
types. The stem matches the table constant: `userModelTable` maps to `UserModelRow` and
`InsertUserModelRow`.

## Case Safety

Two sibling paths must not differ only by letter case. Platform-extension pairs are distinct by
platform selector and are allowed. Follow the case-only rename procedure in
[Git Workflow](../guides/git-workflow.md#case-only-renames).
