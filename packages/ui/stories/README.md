# Stories Guide

This directory contains the native Storybook stories for `packages/ui`. Stories stay outside
`src/` so the runtime component tree contains only package code and tests.

## Structure

```txt
stories/
├── components/
│   └── primitives/
│       └── button.stories.tsx
└── foundations/
    ├── colors.stories.tsx
    └── showcase.tsx
```

`components/` documents rendered components; `foundations/` documents the design tokens
themselves — colours, type scale, radii — and reads them from the theme with
`useCSSVariable` rather than restating values, so the pages cannot drift from
`packages/design-tokens`. Files that are not `*.stories.tsx` are shared helpers and are not
collected by Storybook.

Use kebab-case filenames and import components through the public
`@cherrystudio/ui/components` entry point. Run Storybook from the workspace root:

```sh
pnpm storybook
```
