# Naming Conventions

This reference defines names for files, directories, and identifiers. Read
[Code Organization](./code-organization.md) for placement and public-surface rules, and
[Runtime Ownership](./runtime-ownership.md#role-names) before naming a stateful owner.

## Files

| Location or role | Convention | Example |
| --- | --- | --- |
| Product React component under `src/frontend` | `PascalCase.tsx` | `ChatScreen.tsx` |
| Expo Router route under `src/app` | `kebab-case.tsx` or a reserved route token | `api-key-settings.tsx`, `_layout.tsx` |
| Hook | `useXxx.ts` or `useXxx.tsx` when it returns JSX | `useMessages.ts` |
| Class outside `packages` | `PascalCase.ts` matching the class | `MobileAgentHost.ts` |
| Function, constants, or function group outside `packages` | `camelCase.ts` | `messageQueryOptions.ts` |
| Test | matching base name plus `*.test.ts(x)` | `rowMappers.test.ts` |
| Config | `*.config.ts`, or JS/MJS when TypeScript is unsupported | `drizzle.config.ts` |
| Type declaration | lowercase or `kebab-case` plus `*.d.ts` | `expo-env.d.ts` |
| Root meta document or directory index | `UPPERCASE.md` | `AGENTS.md`, `README.md` |
| Guide, reference, or package-local document | `kebab-case.md` | `testing-and-ci.md` |

Every file newly added or renamed under `packages/**` uses a `kebab-case` base name, regardless of
its primary export. Tool-mandated names, `README.md`, and lowercase barrels such as `index.ts` keep
their required spellings. Existing package filenames that differ are migration debt, not precedent;
do not rename them incidentally.

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

Under `packages/**`, apply the package naming rule to both directory and file stems, for example
`icon-glyph/icon-glyph.ios.tsx`. Keep shared types, APIs, and implementation in the same family
directory when both platform variants need them; Metro selects the platform file at build time.

## Directories

| Directory role | Convention | Example |
| --- | --- | --- |
| Package under `packages/*` | `kebab-case`, matching the unscoped package name | `ai-sdk-provider` |
| New or renamed directory anywhere under `packages/**` | `kebab-case` | `bottom-sheet` |
| Component family outside `packages` | the `PascalCase` component name | `MainHeader` |
| Collection bucket | lowercase plural noun | `services`, `hooks`, `schemas` |
| Business or domain module outside `packages` | singular `camelCase` name | `modelPicker`, `webSearch` |
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

For new mobile-owned acronyms in `PascalCase` or `camelCase`, capitalize only the first letter:
`HttpClient`, `UserId`, `McpServer`, `httpClient`. Desktop-aligned names and public shared contracts
retain their existing upstream spelling, such as `McpRuntimeService`.

Every Drizzle table in `src/backend/data/db/schemas` exports `XxxRow` and `InsertXxxRow` inferred
types. The stem matches the table constant: `userModelTable` maps to `UserModelRow` and
`InsertUserModelRow`.

## Case Safety

Two sibling paths must not differ only by letter case. Platform-extension pairs are distinct by
platform selector and are allowed. Follow the case-only rename procedure in
[Git Workflow](../guides/git-workflow.md#case-only-renames).
