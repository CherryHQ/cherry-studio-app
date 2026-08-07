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

`Composer` is a shared input surface: a text field that grows with its content and, under it, a
toolbar row. Nothing but the field is built in. It is fully controlled — the caller owns `value` and
`attachments` — and carries no i18n or attachment-picking logic, so the same component backs a chat
screen, an image prompt, or a story.

```tsx
import { Composer } from '@cherrystudio/ui/components';

<Composer
  attachments={attachments}
  labels={{ send: t('chat.input.action.sendMessage') }}
  onAttachmentRemove={removeAttachment}
  onChangeText={setDraft}
  onSend={send}
  onStop={stop}
  placeholder={t('chat.inputPlaceholder')}
  streaming={isStreaming}
  value={draft}
/>;
```

That renders the default layout — attachments, the field, and a toolbar holding nothing but send.
Pass `children` to arrange the parts yourself and to fill the toolbar with your own tools:

```tsx
<Composer onChangeText={setDraft} onSend={send} value={draft}>
  <Composer.Attachments />
  <Composer.Input placeholder={t('chat.inputPlaceholder')} />
  <Composer.Toolbar>
    <Composer.Menu accessibilityLabel={t('chat.media.attach')}>
      <Composer.Menu.Item icon={<CameraIcon />} label={t('chat.media.camera')} onPress={openCamera} />
      <Composer.Menu.Item icon={<ImagesIcon />} label={t('chat.media.photos')} onPress={pickPhotos} />
    </Composer.Menu>
    <Composer.Action accessibilityLabel={t('model.select')} onPress={openModelPicker}>
      <SlidersHorizontalIcon className="size-6 text-foreground" />
    </Composer.Action>
    <Composer.Send />
  </Composer.Toolbar>
</Composer>;
```

Nothing is mandatory, sending included — the root does not check what you composed. Tools sit where
they are written and `Composer.Send` pins itself right, so adding one never moves the send button and
callers never need grouping views. `Composer.Action` is the button shell every tool should use: it
owns the circle, the 44pt slop, and the tint, so the row stays one size and one material no matter
who contributed a button to it.

State reaches the parts through context, so `<Composer.Send />` takes nothing. That context is split
in two — the state half changes on every keystroke, the actions half only when the caller's handlers
do — so a tool that merely acts keeps its identity while the user types. Sendability defaults to
"there is text or an attachment"; pass `canSend` when it depends on something the composer cannot
see, such as an image model that has to be picked first or a mode that needs no prompt at all.

Only the platform-divergent chrome sits behind a `.ios` / `.android` seam: `Surface` for the material
(Liquid Glass on iOS 26+, a plain rounded surface elsewhere) and `composerTextStyle.*` for the text
field's line height, which iOS has to override. Layout, state, and the strip animation are identical
on both platforms and stay in `composer.tsx` rather than being duplicated into a `composer.ios` /
`composer.android` pair that would drift.

The line height override is worth understanding before touching the field's padding. Tailwind's
`text-base` carries a 24pt line height, 6pt more than the font needs, and UIKit puts all of that extra
leading below the baseline instead of splitting it. The glyphs end up low inside their own box while
the caret, which tracks the line box, stays centered — so padding cannot fix it, since shifting the
field moves both together and centering one puts the other 3pt out. Only the line height closes the
gap. 20 leaves a 1pt glyph offset that is invisible at this size while keeping enough leading for CJK
to breathe when the field wraps.

`Surface` takes its geometry in `style`, never `className` — `GlassView` ignores `className`, so
anything expressed there would apply to the fallback branch only and the two would silently diverge.
That includes content alignment, which is why callers own it.

The measured geometry lives in `composer.layout.ts` so the parts cannot drift apart. The toolbar's
buttons are sized to their icons rather than to their reach — the circle is 32pt and the rest of the
44pt target comes from slop. The text lines up with the icons' *ink*, not their boxes: lucide draws
its 24pt icons with ~4pt of margin inside the box, and aligning the boxes leaves the toolbar looking
indented from the text above it.

Every circular surface in here is tinted rather than left as plain glass. A `GlassView` renders
nothing when it sits on another one — the material has nothing behind it to refract — so an untinted
button on the composer's own surface is invisible, not merely faint. `Composer.Action` resolves the
tint from its `className` and hands it to both branches, which is why callers never pass one.

The attachment strip is height-clipped and animates between zero and its measured content height,
so adding or removing a thumbnail swells and shrinks the surface instead of snapping it. The
thumbnails stay mounted through the collapse — rendering `attachments` directly would unmount them
the instant the list empties, leaving an empty box to shrink.

`Composer.Menu` is a circular trigger that morphs into a panel, sized from its items. It is private
to the composer — the morph is tuned to open out of a toolbar button, so it is not exported on its
own. The panel is laid out at full size from the first frame and the closed button is a clip window
over it, so the children are measured once instead of on every animation frame. While open it moves
into a `Portal`: it has to paint over whatever sits beside it, and its dismiss catcher has to reach
the whole screen — an in-place one only receives touches inside its ancestors' bounds. It stays there
until the close animation lands, so the collapse does not play back under the neighbouring content.
`Composer.Menu.Item` closes the menu before running `onPress`, and the context provider travels with
the menu into the portal, since the portal re-renders its children under the host rather than
teleporting the React node.

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
