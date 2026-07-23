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
- Do not import one screen's private module from another screen. Move the shared behavior to a
  neutral `src/components`, `src/hooks`, or `src/utils` module when the second owner appears.

## Ownership Rules

- Count independent screen or feature owners, not the number of importing files. Reuse within one
  screen tree remains screen-private.
- Co-locate providers, context, hooks, pure helpers, and tests with the UI behavior they coordinate.
- Add an `index.ts` only when routes, a parent screen area, or sibling modules need a deliberate
  public surface. Internal leaf imports remain relative.
- Tests may deep-import the unit they directly test. Consumer tests use the same public boundary as
  production callers.

## Current Ownership

- `ChatScreen/`: chat topic screen, new-topic screen, message content, message item rows, and
  workspace behavior.
- `AssistantScreen/`: assistant list and assistant editing flows.
- `SettingsScreen/`: settings home (with the animated profile hero at the top), about/data/model/
  provider/web-search settings screens, and settings-specific UI controls.
- `PaintingScreen/`: painting composer (image generation), the drawings tab body (`DrawingList`)
  hosted by the messages shell, plus the nested full-screen viewer (`PaintingViewerScreen/`) and
  conversation (`PaintingConversationScreen/`) screens, bundled prompt templates (`templates/`), and
  shared generation/handoff/masonry helpers.
- `MessagesScreen/`: the `(messages)` tab shell — scope tabs (`MessageScopeTabs/`), the two-page
  `MessagePager`, and the multi-select chrome (`SelectionControls` + `SelectionToolbar/`). It hosts
  the conversations and drawings tab bodies through their feature `index.ts` and owns no
  tab-specific data.
- `TopicListScreen/`: the conversations tab body — the topic list, topic actions/dialogs, the
  `TopicListProvider` topic data, and `useTopicSelectionSource`. It renders as a tab inside
  `MessagesScreen/` rather than being a route itself.
- `GlobalSearchScreen/`: app-level native search entry and screen shell.
- `HomeScreen/`: home-tab content (activity calendar) and the header-right avatar button.

Reusable modules that remain in `src/components` include app shell modules (`headers`, `navigation`),
shared flows such as `modelPicker`, the neutral `messageTabs` scope/selection/source-registry shared
by the messages shell and its tab bodies, shared UI behavior such as `confirmDialog`, and native
dependency adapters such as `nativePrimitives`.
