# Screen Module Conventions

This directory owns screen implementations used by Expo Router route files in `src/app`.

## Route Adapter Rule

`src/app` files should stay thin and define routes only:

```ts
export { SettingsScreen as default } from '@/screens/SettingsScreen';
```

Screen composition, screen-private components, hooks, context, utils, and tests belong here.

## Module Shape

Screen modules should usually look like this:

```text
ScreenName/
  ScreenName.tsx
  index.ts
  components/
  context/
  hooks/
  utils/
```

Nested screen areas can own their own modules:

```text
SettingsScreen/
  ProviderScreen/
  WebSearchScreen/
```

## Imports

- Route files import from screen module roots.
- Screen internals should use relative imports for their own submodules.
- Cross-screen reusable modules should come from `src/components`.
- Do not import screen-private modules from `src/components`.

## Current Ownership

- `ChatScreen/`: chat topic screen, new-topic screen, message content, message item rows, and
  workspace behavior.
- `SettingsScreen/`: settings home, about/data/model/provider/web-search settings screens, and
  settings-specific UI controls.

Reusable modules that remain in `src/components` include app shell modules (`drawer`, `headers`,
`navigation`) and independent reusable flows such as `modelPicker`.
