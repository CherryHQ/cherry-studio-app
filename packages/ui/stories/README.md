# Stories Guide

This directory contains the native Storybook stories for `packages/ui`. Stories stay outside
`src/` so the runtime component tree contains only package code and tests.

## Structure

```txt
stories/
├── components/
│   └── primitives/
│       └── button.stories.tsx
├── foundations/
│   ├── colors.stories.tsx
│   └── showcase.tsx
└── message-parts/
    ├── content.stories.tsx
    ├── loading.stories.tsx
    ├── playground.stories.tsx
    ├── reasoning.stories.tsx
    └── tools.stories.tsx
```

`components/` documents rendered components; `foundations/` documents the design tokens
themselves — colours, type scale, radii — and reads them from the theme with
`useCSSVariable` rather than restating values, so the pages cannot drift from
`packages/design-tokens`. Files that are not `*.stories.tsx` are shared helpers and are not
collected by Storybook.

`message-parts/` is a dedicated top-level Storybook section for debugging structured chat content.
It exercises the public `MessagePart` compound interface with resolved fixture data; application
message schemas and providers remain outside CherryUI.

`Message Parts/Loading` exposes the two live states used before answer content settles: pending
response and running reasoning. Both stories compose the same public components used by chat.

`Message Parts/Playground` renders every public message-part primitive and state together for fast
visual comparison. Disclosure rows remain interactive, so their real detail sheets can be inspected
without leaving the page.

Application schema adapters are exercised separately under `Messages/*`, sourced from
`.rnstorybook/stories/messages`. Those stories use the real application rows and
dispatchers with deterministic in-memory i18n, preference, file, and data providers; they do not
start the production backend.

Use kebab-case filenames and import components through the public
`@cherrystudio/ui/components` entry point. Run Storybook from the workspace root:

```sh
pnpm storybook
```
