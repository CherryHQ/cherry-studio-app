# Feature Module Conventions

This directory owns the app's features — screen implementations plus the feature-private
components, hooks, context, runtime projections, session owners, and utils that back them (ADRs
0010 and 0011). Expo
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
in the feature (`chat/runtime/` for the shared Chat Runtime; painting's generation hook for its
caller-owned session).

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

- `chat/`: chat topic screen, new-topic screen, message content, message item rows, workspace
  behavior, and the React subscription/effect adapter for the app-owned `ChatRuntime`. `input/` and
  `workspace/` are its public areas.
- `assistants/`: assistant list and assistant editing flows.
- `settings/`: settings home (with the animated profile hero at the top), about/data/model/
  provider/web-search/mcp/permissions settings screens, and settings-specific UI controls.
- `paintings/`: painting composer (image generation), the drawings tab body (`DrawingList`) hosted
  by the messages shell, the nested full-screen viewer (`PaintingViewerScreen/`) and conversation
  (`PaintingConversationScreen/`) screens, bundled prompt templates (`templates/`), and the
  painting data hooks (`hooks/usePaintings`).
- `messages/`: the `(messages)` tab shell — scope tabs (`MessageScopeTabs/`), the two-page
  `MessagePager`, and the multi-select chrome. It hosts the conversations and drawings tab bodies
  through their feature `index.ts` and owns no tab-specific data.
- `topics/`: the conversations tab body — the topic list, topic actions/dialogs, the
  `TopicListProvider` topic data, and `useTopicSelectionSource`. It renders as a tab inside
  `messages/` rather than being a route itself.
- `search/`: app-level native search entry and screen shell.
- `home/`: home-tab content (activity calendar) and the header-right avatar button.
- `onboarding/`: onboarding flow and the logo draw animation.

Reusable modules that remain in `src/frontend/components` include app shell modules (`headers`,
`navigation`), shared flows such as `modelPicker`, the neutral `messageTabs`
scope/selection/source-registry shared by the messages shell and its tab bodies, shared UI
behavior such as `AppAlertProvider`, and native dependency adapters such as `nativePrimitives`.
