# Feature Module Conventions

This directory owns the app's features — screen implementations plus the feature-private
components, hooks, context, runtime projections, session owners, and utils that back them. Expo
Router route files in `src/app` stay thin and re-export from here.

## Route Adapter Rule

`src/app` files should stay thin and define routes only:

```ts
export { SettingsScreen as default } from '@/frontend/features/settings';
```

Feature composition, feature-private components, hooks, context, utils, and tests belong here.

## Module Shape

Feature modules should usually look like this:

```text
featureName/
  FeatureScreen.tsx
  index.ts
  components/
  context/
  hooks/
  utils/
```

Screen areas inside a feature can own their own modules:

```text
settings/
  ProviderScreen/
  WebSearchScreen/
```

A feature that subscribes to an app-owned runtime or owns a backend session keeps its React adapter
in the feature. `chat/runtime/` observes the app-owned Mobile Agent Host; painting hooks observe the
durable job ledger without owning the job lifetime.

## Imports

ESLint enforces these (see the boundary blocks in `eslint.config.js`):

- Route files import from feature module roots (`@/frontend/features/<name>`).
- Feature internals use relative imports for their own submodules; the alias form of a feature's
  own module counts as a deep import and is flagged.
- Cross-feature imports go through a public surface: `@/frontend/features/<name>` or
  `@/frontend/features/<name>/<area>` (an area with a deliberate `index.ts`, e.g. `@/frontend/features/chat/input`,
  `@/frontend/features/chat/workspace`). Deep value imports past that are lint errors; type-only deep
  imports are allowed.
- A small allowlist of pure-logic modules is sanctioned for direct deep import so logic-only
  consumers don't load a component barrel (documented in
  `src/frontend/components/composer/index.ts`); extend it deliberately, in the same commit that adds
  the new dependency.
- Cross-feature reusable modules with two or more feature owners belong in neutral
  `src/frontend/components`, `src/frontend/hooks`, or `src/frontend/utils` — move them when the
  second owner appears.
- Do not import feature-private modules from `src/frontend/components` (shared layers never depend on
  features).

## Ownership Rules

- Count independent feature owners, not the number of importing files. Reuse within one feature
  tree remains feature-private.
- Co-locate providers, context, hooks, pure helpers, and tests with the UI behavior they
  coordinate.
- Add an `index.ts` only when routes, a parent area, or another feature needs a deliberate public
  surface. Internal leaf imports remain relative.
- Tests may deep-import the unit they directly test. Consumer tests use the same public boundary
  as production callers.

## Current Ownership

- `chat/`: Agent Session chat screen, new-session composer, message rows, workspace behavior, and
  the React observation/effect adapter for the app-owned Mobile Agent Host. `input/` and
  `workspace/` are its public areas.
- `agents/`: Agent list and editor. Selecting a row enters a new chat; edit/delete remain row
  actions.
- `settings/`: settings home (with the animated profile hero at the top), about/data/model/
  provider/web-search/mcp/permissions settings screens, and settings-specific UI controls.
- `paintings/`: painting composer (image generation), the painting history screen
  (`PaintingHistoryScreen` hosting `DrawingList`), the nested full-screen viewer
  (`PaintingViewerScreen/`) and conversation (`PaintingConversationScreen/`) screens, bundled
  prompt templates (`templates/`), and the painting data hooks (`hooks/usePaintings`).
- `sessions/`: Agent Session management (`SessionListScreen` at `/sessions`) — recency pagination,
  rename/delete, and selection state. The sidebar reuses its data layer through the feature index.
- `sidebar/`: the drawer sidebar compound (`Sidebar.Header/Body/Footer`) — navigation rows, the
  recent Agent Sessions list, and the bottom dock.
- `home/`: the home drawer scene (activity calendar) and the header-right avatar button.
- `onboarding/`: onboarding flow and the logo draw animation.

Reusable modules that remain in `src/frontend/components` include app shell modules (`headers`,
`navigation`), shared flows such as `modelPicker`, and the neutral `selection`
multi-select/source-registry shared by list screens. Reusable native UI adapters and shared UI
behavior such as the alert controller belong in CherryUI.
