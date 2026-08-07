# UI Package

Shared Cherry Studio UI for the mobile app. This package owns product interaction
components and the mobile WebP runtime for the desktop UI icon set.

## Components

Runtime imports use the component-only entry point so Metro does not traverse the icon registries:

```tsx
import { Button } from '@cherrystudio/ui/components';
import { PlusIcon } from 'lucide-uniwind/png';

<Button icon={<PlusIcon />} loading={isSaving} onPress={save} size="lg" variant="default">
  Save
</Button>;

<Button accessibilityLabel="Add" icon={<PlusIcon />} onPress={add} />;
```

`Button` is backed by React Native's `Pressable` on both iOS and Android. It supports `default`,
`destructive`, `outline`, `secondary`, and `ghost` variants, along with loading and disabled
behavior. The `sm`, `default`, and `lg` sizes use content-driven typography and padding without
fixed dimensions. The `icon` prop renders an icon before the label and automatically switches to
the matching icon-only padding when no label is provided. Icon-only buttons must provide an
`accessibilityLabel`. `Button.Label` remains available for custom composed content. Callers do not
need an Expo UI `Host`.

Shared components with text must be content-driven: avoid fixed width or height, keep React Native's
system font scaling enabled, and allow constrained labels to wrap. `Button` follows this rule by
using padding for its touch target and letting its label shrink and grow the container.

`Composer` is the chat input bar: a leading action, a pill that grows with its content, and a
primary action that flips between send and stop. It is fully controlled — the caller owns `value`
and `attachments` — and carries no i18n or attachment-picking logic, so the same component backs a
chat screen, a prompt box, or a story.

```tsx
import { Composer } from '@cherrystudio/ui/components';

<Composer
  attachments={attachments}
  labels={{ send: t('chat.input.action.sendMessage') }}
  onAttachmentRemove={removeAttachment}
  onChangeText={setDraft}
  onLeadingPress={openAttachmentSheet}
  onSend={send}
  onStop={stop}
  placeholder={t('chat.inputPlaceholder')}
  streaming={isStreaming}
  value={draft}
/>;
```

Only the platform-divergent chrome sits behind a `.ios` / `.android` seam
(`composerPlatform.*`): the surface material (Liquid Glass on iOS 26+, a plain rounded surface
elsewhere) and the text field's vertical insets, which iOS needs asymmetric to cancel UITextView's
baseline offset. Layout, state, and the strip animation are identical on both platforms and stay in
`composer.tsx` rather than being duplicated into a `composer.ios` / `composer.android` pair that
would drift.

The attachment strip is height-clipped and animates between zero and its measured content height,
so adding or removing a thumbnail swells and shrinks the pill instead of snapping it. The thumbnails
stay mounted through the collapse — rendering `attachments` directly would unmount them the instant
the list empties, leaving an empty box to shrink. Pass `leading` to replace the built-in "+" circle
with your own menu or sheet trigger; pass `leading={null}` to drop it entirely.

The host app must configure Uniwind, scan `packages/ui/src`, and provide the shared semantic color
tokens. This workspace does so in `src/frontend/styles/global.css`.

## Storybook

Stories are development-only assets kept outside the runtime source tree, matching the desktop UI
package structure:

```txt
packages/ui/stories/components/primitives/button.stories.tsx
```

Run the native Storybook entry with:

```sh
pnpm storybook
```

The command opens Storybook in Expo Go, keeping it isolated from the Cherry Studio development
client. Use `pnpm storybook:clear` after changing Storybook or Metro configuration. Storybook is
enabled by entry-point swapping, so the normal Expo entry and production bundles do not import it.

## Icon Sync

The source icons are copied from the desktop repository's `packages/ui` package.

Synced source SVGs live in this package under:

```txt
packages/ui/icons/general
packages/ui/icons/providers/light
packages/ui/icons/providers/dark
packages/ui/icons/models/light
packages/ui/icons/models/dark
```

Generated WebP assets are consumed by the mobile app through static Metro
registries:

```txt
packages/ui/src/icons-webp/general/light
packages/ui/src/icons-webp/general/dark
packages/ui/src/icons-webp/models/light
packages/ui/src/icons-webp/models/dark
packages/ui/src/icons-webp/providers/light
packages/ui/src/icons-webp/providers/dark
packages/ui/src/icons-webp/**/index.ts
```

The source SVGs under `packages/ui/icons` are conversion inputs only. Runtime
imports should come from the format-neutral `@cherrystudio/ui/icons` exports,
not from the source SVG or generated WebP directories.

Do not edit generated icons directly. Update the SVG source or the generator,
then run the relevant generator again.

## Generation

Run all icon generation from the app workspace root:

```sh
pnpm ui:icons:generate
```

Scoped generation is also available:

```sh
pnpm ui:icons:generate:general
pnpm ui:provider-icons:generate
pnpm ui:icons:generate:models
```

The WebP generator is:

```txt
packages/ui/src/scripts/generate-icons.ts
```

It renders general, model, and provider SVG sources to transparent 72px lossless
WebPs with `sharp`, writes light and dark assets under `src/icons-webp`, and generates static
`require()` registries for Metro. SVGs using `currentColor` are rendered as
theme foreground WebP pairs.

Current generated counts:

- General icons: 22
- Provider icons: 156
- Model icons: 168

## WebP Runtime

Icons use static source pairs:

```ts
import { resolveIcon, resolveProviderIcon } from '@cherrystudio/ui/icons';

const icon = resolveIcon(modelId, providerId) ?? resolveProviderIcon(providerId);
const source = icon?.[theme];
```

Call sites pass the selected source to `expo-image`. Theme switching is handled
by choosing `light` or `dark` from the returned pair.

If a dark SVG does not exist, the generated dark WebP entry points to the light
WebP unless the source uses `currentColor`. This keeps the API stable while still
allowing later dark assets to be added without changing call sites.

Provider id aliases live in:

```txt
packages/ui/src/icons-webp/provider-aliases.ts
```

When adding a new provider id that differs from the source SVG name, add an
alias and extend `packages/ui/src/icons-webp/__tests__/providers.test.ts`.

## App Wiring

The app resolves `@cherrystudio/ui` through the workspace package and tsconfig
paths.

Generated icon directories are excluded from lint and format checks in
`.oxlintrc.json` and `.oxfmtrc.json`. Run those against hand-written package
files instead of generated icon output.

The model picker and settings pages render resolver output with `expo-image`.

## Validation

After syncing or changing icons, run:

```sh
pnpm ui:icons:generate
pnpm typecheck
pnpm test packages/ui/src/icons/__tests__/registry.test.ts packages/ui/src/icons-webp/__tests__/providers.test.ts --runInBand
pnpm exec oxlint packages/ui
pnpm exec oxfmt --check packages/ui
git diff --check
```

If the root app adds or removes the workspace dependency, also update
`pnpm-lock.yaml` with:

```sh
pnpm install --lockfile-only
```
