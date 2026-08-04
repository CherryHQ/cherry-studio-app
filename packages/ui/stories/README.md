# Stories Guide

This directory contains the native Storybook stories for `packages/ui`. Stories stay outside
`src/` so the runtime component tree contains only package code and tests.

## Structure

```txt
stories/
└── components/
    └── primitives/
        └── button.stories.tsx
```

Use kebab-case filenames and import components through the public
`@cherrystudio/ui/components` entry point. Run Storybook from the workspace root:

```sh
pnpm storybook
```
