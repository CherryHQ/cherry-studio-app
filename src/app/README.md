# App Route Conventions

This directory contains Expo Router route definitions. It follows the repository-wide naming rules
in [`docs/rules/naming-conventions.md`](../../docs/rules/naming-conventions.md) plus Expo Router's
file-system routing rules.

`src/app` is intentionally thin. Screen implementation belongs under `src/screens`; reusable
cross-screen modules belong under `src/components`.

## Ownership

- Keep only route files, route groups, dynamic route folders, `_layout.tsx`, and this `README.md`
  here.
- Put screen composition, private components, hooks, context, utils, and tests in `src/screens`.
- Put reusable app-shell or cross-screen modules in `src/components`.
- Do not co-locate route-owned UI modules under `src/app`.

## Route Adapters

Route files should usually re-export a screen module:

```ts
export { SettingsScreen as default } from '@/screens/SettingsScreen';
```

Use the route file only for Expo Router concerns, such as:

- `_layout.tsx` stack or group configuration.
- `unstable_settings` or route-level options.
- A small redirect or adapter when the route itself must choose the target screen.

If a route grows real UI, state coordination, data loading, or helper logic, move that code to the
owning `src/screens/*` module and keep the route as an adapter.

## Naming

- Use Expo Router's required filenames for routing: `index.tsx`, `_layout.tsx`, `[param].tsx`, and
  `(group)/`.
- Use `kebab-case` for literal route segment filenames, such as `model-picker.tsx`.
- Use meaningful dynamic segment names, such as `[providerId]`.
- Keep public URL structure in `src/app`; keep module names and implementation ownership in
  `src/screens`.

## Imports

- Route files import screens from module roots, for example `@/screens/SettingsScreen`.
- Route files may import shared layout components only when implementing `_layout.tsx`.
- Route files should not import screen-private leaf modules.
