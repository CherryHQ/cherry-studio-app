# Component Module Conventions

This directory follows repository-wide [Code Organization](../../../docs/references/code-organization.md)
and [Naming Conventions](../../../docs/references/naming-conventions.md). The notes below define only
the local import boundary and concrete module shape for `src/frontend/components`.

`src/frontend/components` contains component families shared by two or more independent pages.
Page-specific UI stays under `src/frontend/features/<page>/components`; app-wide
navigation, headers, and startup coordination live under `src/frontend/appShell`.

## Module Names

- Every direct child is a `PascalCase` component family such as `ModelPicker`, `Message`, or
  `FileEntryPreview`.
- Use lowercase plural bucket names only for categorical containers: `components`, `context`,
  `hooks`, `utils`.
- Name the family after the UI concept it owns. Do not add generic `common`, `shared`, or `business`
  buckets below this directory.

## Module Shape

Shared component modules should usually look like this:

```text
ComponentFamily/
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

- External callers should import from the component-family root, for example
  `@/frontend/components/ModelPicker`.
- Module internals should use relative imports for their own `components`, `context`, `hooks`, and
  `utils`.
- Tests may import the specific utility under test. Consumer tests should use the public module
  root.
- Do not make callers import leaf files under `components/` unless that file is intentionally the
  module's public surface.
- `src/frontend/components` must not import private page modules from `src/frontend/features`.

## Reusable vs Page-Owned

- Count independent owners, not import statements. Reuse between `ChatInput` and `ChatWorkspace`
  is still owned by the chat page; structured message rendering moved to
  `Message` only after painting became a second owner.
- Promote UI into an independent component family, such as `ModelPicker`, only when a second page
  consumes it.
- Keep page-specific UI under the owning page's `components/` directory.
- If a module starts being used outside its owning page, move it to a neutral owner instead of
  exporting through the original page.
- A route workflow belongs in `src/frontend/features`; app-wide infrastructure belongs in
  `src/frontend/appShell`; platform-neutral interaction primitives belong in CherryUI.

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
