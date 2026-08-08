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
toolbar row. Nothing but the field is built in. It is fully controlled — the caller owns `value` —
and carries no i18n, attachment handling, or picking logic, so the same component backs a chat
screen, an image prompt, or a story.

```tsx
import { Composer } from '@cherrystudio/ui/components';

<Composer
  labels={{ send: t('chat.input.action.sendMessage') }}
  onChangeText={setDraft}
  onSend={send}
  onStop={stop}
  placeholder={t('chat.inputPlaceholder')}
  streaming={isStreaming}
  value={draft}
/>;
```

That renders the default layout — the field, and a toolbar holding nothing but send. Pass `children`
to arrange the parts yourself and to fill the toolbar with your own tools:

```tsx
<Composer onChangeText={setDraft} onSend={send} value={draft}>
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

`Composer.Pill` is its wide sibling, for a tool that has to say what it is *set to* rather than only
what it does — the model in use, a mode. Same height and material, but sized to its label, and it is
the one thing in the row that can be arbitrarily wide, so it is also the one thing that gives: it
shrinks before the toolbar does. Its `icon` is held out of that on purpose, so a long model name
squeezes the text and not the logo.

State reaches the parts through context, so `<Composer.Send />` takes nothing. That context is split
in two — the state half changes on every keystroke, the actions half only when the caller's handlers
do — so a tool that merely acts keeps its identity while the user types. Sendability defaults to
"there is text"; pass `canSend` when it depends on something the composer cannot see, such as an
attachment the caller holds, an image model that has to be picked first, or a mode that needs no
prompt at all.

Only the platform-divergent chrome sits behind a `.ios` / `.android` seam: `Surface` for the material
(Liquid Glass on iOS 26+, a plain rounded surface elsewhere) and `composerTextStyle.*` for the text
field's line height, which iOS has to override. Layout, state, and the collapse animation are identical
on both platforms and stay in `composer.tsx` rather than being duplicated into a `composer.ios` /
`composer.android` pair that would drift.

`Composer.Input` wraps its field in `expo-paste-input`'s `TextInputWrapper` and forwards every paste
to `onPaste`, unfiltered — text included, though the field has already handled it. Which pastes are
worth acting on is the caller's question, and only the caller can answer it. The wrapper is there
even when no handler is passed: it costs one native view, and making the field's hierarchy depend on
a callback would mean a caller adding paste support later has to debug a layout change they did not
make.

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
44pt target comes from slop. Everything inside sits flush against the surface's own padding, so the
buttons, the field, and any row stacked above them share one left edge. The alternative — indenting
the text so its ink lines up with the icons', since lucide draws its 24pt icons with ~4pt of margin
inside the box — is what this did while the buttons were bare glyphs. Once they grew visible tinted
circles the circle's edge became what the eye lines up against, and a row above the field is as
likely to be a filled pill as it is to be text.

Every circular surface in here is tinted rather than left as plain glass. A `GlassView` renders
nothing when it sits on another one — the material has nothing behind it to refract — so an untinted
button on the composer's own surface is invisible, not merely faint. `Composer.Action` resolves the
tint from its `className` and hands it to both branches, which is why callers never pass one.

Rows above the field — an attachment strip, a status line, a selected-tool tag — are placed by the
order they are written, not by named slots, and a row that never disappears is just a `View`. What is
not free is the swell and shrink, so that is what `Composer.Collapsible` provides: render `null` to
collapse it and the surface follows.

```tsx
<Composer.Collapsible>
  {isSearching ? <StatusPill label={t('chat.search.running')} /> : null}
</Composer.Collapsible>
```

It holds the last non-empty frame until the collapse lands, so callers write a plain conditional
instead of keeping a copy around for the animation to shrink.

The package deliberately ships no attachment strip. It had one, and every real consumer wanted a
shape it did not have — images and files side by side, horizontal scrolling, tap to preview — so what
generalised was the collapse, not the thumbnails. Callers write their own row inside a
`Composer.Collapsible` and tell the composer about it through `canSend`.

`composer.motion.ts` pairs the package's curves with durations and names each pairing after the
gesture it belongs to, so anything that changes the composer's size settles on one curve and a row
swelling while the menu closes reads as one gesture rather than as two animations that happen to
overlap. Neither is configurable — two rows in one surface moving at different speeds reads as
broken, not as customisable — and reduced motion lands everything on its final size instead.

The height is measured and driven by a shared value rather than left to a layout animation. A layout
animation tweens the row's own frame *after* its parent has committed the new one, so the surface
would snap to its final height while the row slid into place; driving the height directly makes the
surface reflow with it, on one.

Measuring the content is where the trap is. A collapsed row is a zero-height clip, and a child
measured inside one never lays out at all — `onLayout` never fires, so the height the animation is
waiting for never arrives and the row stays shut forever, silently and only when it starts closed.
The content is floated out of flow so it keeps its natural height whatever the clip above it is
doing. The chat input floats its own content column for the same reason.

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

Both of the panel's axes are measured and driven by shared values, which is what lets an open menu
grow to children that swap in under it rather than snapping to them. React state read inside
`useAnimatedStyle` cannot do this: the new size arrives in one commit, with no frames in between.
That, plus `closeOnPress={false}` on the item that leads inward, is the whole of what a caller needs
to build a second level — a media menu whose "Photos" row opens a grid in place. The menu itself has
no notion of levels, and `width` is a floor rather than a size, so it stays usable outside the one
screen this was built for. It also will not clamp: a panel grows up and to the right out of its
trigger, so children that want most of the screen have to size themselves against the window.

## Motion

Curves and durations are two axes, exported separately from `@cherrystudio/ui/motion`:

```tsx
import { duration, easing } from '@cherrystudio/ui/motion';

translateX.set(withTiming(next, { duration: duration.base, easing: easing.settle }));
```

A curve is a design token — it means the same thing however far the thing travels — so components
share it. A duration is tuned to the distance, so components pick one. `easing.settle` is pure
deceleration and the right default for anything that moves or resizes something already on screen;
`easing.overshoot` is for something arriving out of nothing, where the overshoot *is* the arrival.

Components pair the two and name the pairing after the gesture rather than exporting a curve of their
own, which is what `composer.motion.ts` does. Nothing here is a full motion system yet: it covers the
package's own components, and the app still has its own easings to bring across.

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
