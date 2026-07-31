# App Route Conventions

This directory contains Expo Router route definitions. It follows the repository-wide
[naming conventions](../../docs/references/naming-conventions.md) plus Expo Router's file-system
routing rules.

`src/app` is intentionally thin. Feature implementation belongs under `src/frontend/features`;
reusable cross-feature modules belong under `src/frontend/components`.

## Ownership

- Keep only route files, route groups, dynamic route folders, `_layout.tsx`, and this `README.md`
  here.
- Put feature composition, private components, hooks, context, utils, and tests in
  `src/frontend/features`.
- Put reusable app-shell or cross-feature modules in `src/frontend/components`.
- Do not co-locate route-owned UI modules under `src/app`.

## Route Adapters

Route files should usually re-export a feature module:

```ts
export { SettingsScreen as default } from '@/frontend/features/settings';
```

Use the route file only for Expo Router concerns, such as:

- `_layout.tsx` stack or group configuration.
- `unstable_settings` or route-level options.
- A small redirect or adapter when the route itself must choose the target screen.

If a route grows real UI, state coordination, data loading, or helper logic, move that code to the
owning `src/frontend/features/*` module and keep the route as an adapter.

## Naming

- Use Expo Router's required filenames for routing: `index.tsx`, `_layout.tsx`, `[param].tsx`, and
  `(group)/`.
- Use `kebab-case` for literal route segment filenames, such as `api-key-settings.tsx`.
- Use meaningful dynamic segment names, such as `[providerId]`.
- Keep public URL structure in `src/app`; keep module names and implementation ownership in
  `src/frontend/features`.

## Imports

- Route files import features from module roots, for example `@/frontend/features/settings`.
- Route files may import shared layout components only when implementing `_layout.tsx`.
- Route files should not import feature-private leaf modules.
