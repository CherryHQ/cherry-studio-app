# Component Module Conventions

This directory follows repository-wide [Code Organization](../../../docs/references/code-organization.md)
and [Naming Conventions](../../../docs/references/naming-conventions.md). The notes below define only
the local import boundary and concrete module shape for `src/frontend/components`.

`src/frontend/components` is for independently owned modules shared across screens or feature
domains. Route-owned UI should live under `src/frontend/features` until a second independent owner
actually consumes it.

## Module Names

- Use `camelCase` for reusable domain modules: `modelPicker`.
- Use lowercase plural bucket names only for categorical containers: `components`, `context`,
  `hooks`, `utils`.
- Use `PascalCase` only when the directory itself is a component adapter or component family:
  `RouteHeader`, `MainHeader`.
- Avoid vague names such as `common`, `parts`, or `messages` when a domain name is available.
  Prefer names that say what the module owns.

## Module Shape

Shared component modules should usually look like this:

```text
moduleName/
  README.md
  index.ts
  components/
  context/
  hooks/
  utils/
```

Only add the subdirectories that the module actually needs.

- `components/`: leaf UI used inside the module.
- `context/`: React providers and context hooks.
- `hooks/`: hooks that coordinate module behavior.
- `utils/`: pure helpers, constants, and co-located `__tests__/`.
- `index.ts`: the public import surface for callers outside the module.
- `README.md`: ownership, public interface, and organization notes.

## Imports

- External callers should import from the module root: `@/frontend/components/modelPicker`,
  `@/frontend/components/headers`.
- Module internals should use relative imports for their own `components`, `context`, `hooks`, and
  `utils`.
- Tests may import the specific utility under test. Consumer tests should use the public module
  root.
- Do not make callers import leaf files under `components/` unless that file is intentionally the
  module's public surface.
- `src/frontend/components` must not import private modules from `src/frontend/features`.

## Reusable vs Feature-Owned

- Count independent owners, not import statements. Reuse between `ChatScreen/input` and
  `ChatScreen/workspace` is still owned by `ChatScreen`; structured message rendering moved to
  `messages` only after painting became a second owner.
- Put UI or behavior in an independent module, such as `modelPicker`, when a second screen or
  component domain consumes it.
- Keep feature-specific UI inside the owning module under `src/frontend/features`.
- If a module starts being used outside its owning feature, move it to a neutral domain module
  instead of exporting through the original feature.
- App shell modules, design-system adapters, and platform adapters may have one direct caller when
  their ownership is inherently app-wide. These exceptions require a stable public API and a
  `README.md` that explains the boundary.

## Hooks, Utils, and Public API

- Hooks stay with the module that owns their state and behavior. Only hooks used across independent
  domains belong in top-level `src/frontend/hooks`.
- Pure helpers stay in the owning module's `utils/`. Only frontend-neutral helpers used across
  independent UI domains belong in `src/frontend/utils`; cross-layer pure helpers belong in
  `src/shared/utils`.
- Add `index.ts` only at a real module boundary. It must contain named re-exports only and expose the
  smallest interface callers need.
- Do not add barrels for private `components/`, `hooks/`, or `utils/` buckets. Import their leaf
  files relatively from inside the module.

## File Names

- React component files use `PascalCase.tsx`.
- Hook files use `useXxx.ts` or `useXxx.tsx`.
- Utility files use `camelCase.ts`.
- Re-export barrels are named `index.ts`.
- Per-directory docs are named `README.md`.
