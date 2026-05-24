# Component Module Conventions

This directory follows the repository-wide naming rules in
[`docs/rules/naming-conventions.md`](../../docs/rules/naming-conventions.md). The notes below are
the local conventions for `src/components`.

`src/components` is for cross-screen reusable modules. Route-owned UI should live under
`src/screens`.

## Module Names

- Use `camelCase` for reusable domain modules: `modelPicker`.
- Use lowercase plural bucket names only for categorical containers: `components`, `context`,
  `hooks`, `utils`.
- Use `PascalCase` only when the directory itself is a component adapter or component family:
  `BackHeader`, `CloseHeader`, `MainHeader`.
- Avoid vague names such as `common`, `parts`, or `messages` when a domain name is available.
  Prefer names that say what the module owns.

## Module Shape

Feature modules should usually look like this:

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

- External callers should import from the module root: `@/components/drawer`,
  `@/components/modelPicker`, `@/components/headers`.
- Module internals should use relative imports for their own `components`, `context`, `hooks`, and
  `utils`.
- Tests may import the specific utility under test.
- Do not make callers import leaf files under `components/` unless that file is intentionally the
  module's public surface.

## Reusable vs Feature-Owned

- Put reusable cross-screen UI or behavior in an independent module, such as `modelPicker`.
- Keep feature-specific UI inside the owning screen module under `src/screens`.
- If a module starts being used outside its owning feature, move it to a neutral domain module
  instead of exporting through the original feature.

## File Names

- React component files use `PascalCase.tsx`.
- Hook files use `useXxx.ts` or `useXxx.tsx`.
- Utility files use `camelCase.ts`.
- Re-export barrels are named `index.ts`.
- Per-directory docs are named `README.md`.
