# UI Package

Shared Cherry Studio UI for the mobile app. This package owns product interaction
components and the mobile WebP runtime for the desktop UI icon set.

## Components

Runtime imports use the component-only entry point so Metro does not traverse the icon registries:

```tsx
import { Button } from '@cherrystudio/ui/components';
import PlusIcon from '@cherrystudio/app-icons/icons/plus';

<Button icon={<PlusIcon />} loading={isSaving} onPress={save} size="lg" variant="default">
  Save
</Button>;

<Button accessibilityLabel="Add" icon={<PlusIcon />} onPress={add} />;
```

`Image` wraps `expo-image` with Uniwind `className` support while preserving the underlying image
API.

`FilePreview` renders and opens a business-neutral file descriptor. The caller supplies display
metadata, whether the file is an image or document, localized state labels, and an error callback;
the component owns platform rendering, loading and unavailable states, system opening, and iOS
Quick Look thumbnail caching:

```tsx
<FilePreview
  file={{
    displayName: 'brief.pdf',
    extensionLabel: 'PDF',
    id: 'file-1',
    kind: 'document',
    revision: 4,
    uri: 'file:///documents/brief.pdf',
  }}
  labels={{ loading: 'Loading', openWith: 'Open with', unavailable: 'Unavailable' }}
  onError={(error, operation) => reportPreviewError(error, operation)}
/>;
```

`onError` distinguishes `open` from `thumbnail`, allowing product code to alert for a failed open
while treating thumbnail generation as a recoverable fallback. CherryUI carries no file database,
logging, or translation dependency.

`MarkdownText` is the shared GitHub-flavored Markdown renderer. It uses the streaming renderer
while content is arriving and the enriched native renderer afterward; both receive the same theme
tokens, syntax palette, LaTeX flags, and typography scale. Product code supplies the active font
size step and decides how links open:

```tsx
<MarkdownText
  fontSizeStep={fontSizeStep}
  isStreaming={isStreaming}
  markdown={markdown}
  onLinkPress={openLink}
/>;
```

Typography utilities are exported from `@cherrystudio/ui/utils`: `normalizeFontSizeStep`,
`resolveTypographyScale`, and `createTypographyCSSVariables` keep native style objects, runtime CSS
variables, MessageList geometry, and settings previews on the same three-step scale.

`MessagePart` is the business-neutral visual family for structured chat content. It owns status
rows, reasoning and tool detail sheets, feedback blocks, source links, placeholders, translation
separators, unknown-part warnings, and structured detail sections. Product code supplies resolved
labels, states, content, and actions; CherryUI does not read message schemas, tool metadata,
translations, file identifiers, or application navigation:

```tsx
<MessagePart.Tool
  closeAccessibilityLabel="Close"
  state="complete"
  statusText="3 results"
  title="Web search"
>
  <MessagePart.Source label="Cherry Studio" onPress={openSource} url="https://cherry-ai.com" />
</MessagePart.Tool>
```

The native Storybook exposes these states under the dedicated top-level `Message Parts` section.
`Message Parts/Playground` collects every public message-part primitive and state on one interactive
page for visual debugging.
`MessagePart.Pending` owns the empty-response loader and its stable text-line height, while
`MessagePart.Reasoning state="running"` owns the active thinking row. Storybook groups both under
`Message Parts/Loading` for direct animation and theme inspection.

`ScrollToBottomButton` is a localized floating control for scrollable surfaces with a measured
bottom accessory. It owns the CherryUI surface, position, and visibility motion; the caller owns
the at-bottom state and the one-shot scroll action:

```tsx
<ScrollToBottomButton
  accessibilityLabel={t('chat.message.scrollToBottom')}
  bottomAccessoryHeight={composerHeight}
  gap={5}
  isAtBottom={isAtBottom}
  onPress={scrollToBottom}
/>;
```

`Alert` is the shared native dialog primitive. Mount one provider at the application root and
inject localized default action labels there; feature code can then enqueue informational,
confirmation, and prompt dialogs through `useAlert()` without owning dialog rendering:

```tsx
<Alert.Provider labels={{ cancel: t('common.cancel'), ok: t('common.ok') }}>
  <App />
</Alert.Provider>
```

The provider presents queued dialogs in request order. Confirmation and prompt actions close
without waiting for asynchronous business work, so failures can enqueue their own follow-up alert.
The standalone `<Alert>` primitive remains available for controlled dialog composition.

`Toast` is the shared gateway for temporary global notifications. Mount one provider at the
application root; feature code then shows notifications through `useToast()` without importing the
underlying toast library or mounting another host:

```tsx
<Toast.Provider>
  <App />
</Toast.Provider>

const { toast } = useToast();
toast.show({ label: 'Saved', variant: 'success' });
```

The gateway preserves the current four-second default duration and exposes `default`, `success`,
`warning`, and `danger` variants.

`Avatar` composes an image or fallback inside a clipped face while keeping badges outside that
clipping boundary. It accepts numeric sizes so product avatars can follow their surrounding layout,
and supports circular and rounded-square faces:

```tsx
<Avatar accessibilityLabel="OpenAI" shape="rounded" size={26}>
  <Avatar.Image contentFit="contain" scale={0.8125} source={source} />
  <Avatar.Badge placement="bottom-end">
    <StatusDot />
  </Avatar.Badge>
</Avatar>
```

Use `Avatar.Fallback` when no image is available. `Avatar.Image`, `Avatar.Fallback`, and
`Avatar.Badge` read the root size through context and must be nested directly inside `Avatar`.

`Button` is backed by React Native's `Pressable` on both iOS and Android. It supports `default`,
`destructive`, `outline`, `secondary`, and `ghost` variants, along with loading and disabled
behavior. The `xs`, `sm`, `default`, and `lg` sizes use content-driven typography and padding without
fixed dimensions. The `icon` prop renders an icon before the label and automatically switches to
the matching icon-only padding when no label is provided. Icon-only buttons must provide an
`accessibilityLabel`. `Button.Label` remains available for custom composed content. Callers do not
need an Expo UI `Host`. The visually compact `xs` size supplies an 8-point hit slop by default so
its effective touch target remains usable.

`Section.RadioItem` is the controlled single-choice variant for grouped rows. It owns the radio
accessibility state, selected checkmark, disclosure behavior, separators, and leading-content inset;
the caller owns the selected value and persistence:

```tsx
<Section>
  {options.map((option) => (
    <Section.RadioItem
      key={option.value}
      label={option.label}
      onPress={() => setValue(option.value)}
      selected={option.value === value}
    />
  ))}
</Section>
```

`Chip` has three explicit variants for compact metadata and filters. All three use quiet neutral
surfaces: the background is the lightest, the border is stronger, and the label has the highest
contrast. Selected chips strengthen the neutral background and border without introducing another
accent color. The semantic tokens adapt this hierarchy to light and dark themes.

```tsx
import { Chip } from '@cherrystudio/ui/components';

<Chip.Removable
  onRemove={removeSearch}
  removeAccessibilityLabel="Remove Web search"
>
  Web search
</Chip.Removable>;

<Chip.Selectable selected={isReasoningEnabled} onSelectedChange={setIsReasoningEnabled}>
  Reasoning
</Chip.Selectable>;

<Chip.Tag>128k context</Chip.Tag>;
```

`Chip.Removable` keeps removal on its trailing close button, `Chip.Selectable` toggles when the
whole chip is pressed, and `Chip.Tag` is non-interactive. Selection and removal remain controlled by
the caller. Removal labels are required so the icon-only action can be localized and announced by
assistive technology.

Shared components with text must be content-driven: avoid fixed width or height, keep React Native's
system font scaling enabled, and allow constrained labels to wrap. `Button` follows this rule by
using padding for its touch target and letting its label shrink and grow the container.

`TextAnimation.Rotating` cycles short, single-line phrases vertically while reserving the width of
the longest phrase, so surrounding content does not move between changes. Use the compound root to
share timing across animated values, or use the variant by itself:

```tsx
import { TextAnimation } from '@cherrystudio/ui/components';
import { Text } from 'react-native';

<TextAnimation duration={2200}>
  <Text>Cherry Studio is </Text>
  <TextAnimation.Rotating
    text={['focused', 'fluid', 'yours']}
    textClassName="font-semibold text-primary"
  />
</TextAnimation>;
```

The variant respects Reduce Motion and `enabled={false}`. Its `className` styles the clipping
container; `textClassName` styles the phrases.

`Input` is the shared field for ordinary and sensitive text. Set `type="password"` for passwords,
API keys, and other secrets; the password variant keeps the controlled value with the caller, owns
whether that value is revealed and where blurred content is displayed, and renders the visibility
action inside the field. Callers must provide localized action labels:

```tsx
import { Input } from '@cherrystudio/ui/components';

<Input
  accessibilityLabel={t('settings.provider.apiService.apiKey')}
  onChangeText={setApiKey}
  type="password"
  value={apiKey}
  visibilityAccessibilityLabels={{
    hide: t('settings.provider.apiService.hideApiKeys'),
    show: t('settings.provider.apiService.showApiKeys'),
  }}
/>;
```

Password visibility starts hidden on every mount. Toggling keeps input focus by default; set
`blurOnVisibilityToggle` only when a consumer intentionally relies on blur to dismiss the keyboard
or commit its draft value. Blurred content is positioned at the start; focusing releases selection
control to the native input, including `selectTextOnFocus`. The password variant fixes `multiline`,
`secureTextEntry`, `selection`, `autoCapitalize`, and `autoCorrect`, while forwarding the remaining
compatible `Input` props. Its `style` prop targets the composed field container. Disabling the field
also disables its visibility action. Plain inputs default to `type="text"`, and their `style` prop
continues to target the native field.

`Menu` is the shared native action menu. It accepts one trigger element and a flat, stable `items`
array; the package owns Nitro wiring, native action dispatch, and platform gesture behavior:

```tsx
import { Menu, type MenuItem } from '@cherrystudio/ui/components';

const items = [
  { id: 'rename', label: 'Rename', onPress: rename },
  { destructive: true, id: 'delete', label: 'Delete', onPress: remove },
] satisfies readonly MenuItem[];

<Menu items={items} trigger="longPress">
  <MessageRow />
</Menu>;
```

Item IDs must be unique within a menu. `checked` is controlled; omitting it creates a regular
action, while `false` and `true` create off and on check states. An empty array returns the child
unchanged. Both platforms render text actions; iOS uses `UIMenu` / `UIContextMenuInteraction`, while
Android uses `PopupMenu`. Each keeps the system style for destructive items. `tap` is for
button-like dropdowns, and `longPress` is for contextual
actions without taking over the child's normal tap. Expo Router page previews remain owned by
`Link.Preview` / `Link.Menu`, not this component.

The native implementation is adapted from MIT-licensed Nitro menu projects. See
[third-party-notices.md](third-party-notices.md) for the complete attribution and license text.

`BottomSheet` is the shared floating-card sheet over
`@swmansion/react-native-bottom-sheet`. It owns card geometry, Liquid Glass fallback, scrim,
safe-area information, and close reasons. The host app keeps one `BottomSheetProvider` at its root.
Its compound components make fixed and scrolling regions explicit:

```tsx
<BottomSheet open={isOpen} onOpenChange={setIsOpen}>
  <BottomSheet.Trigger>Open</BottomSheet.Trigger>
  <BottomSheet.Content height={520} onClose={close}>
    <BottomSheet.Header>
      <BottomSheet.CloseButton accessibilityLabel="Close" />
      <BottomSheet.Title>Models</BottomSheet.Title>
      <BottomSheet.HeaderSpacer />
    </BottomSheet.Header>
    <BottomSheet.SearchField {...searchProps} />
    <BottomSheet.Body>{list}</BottomSheet.Body>
    <BottomSheet.Footer>{actions}</BottomSheet.Footer>
  </BottomSheet.Content>
</BottomSheet>
```

`Trigger` is optional for sheets controlled by feature state. `Body` is a bounded viewport and does
not scroll by itself, so virtualized lists can own scrolling without nesting. Use
`BottomSheet.ScrollView` for ordinary scrolling content. `SearchField`, headers, and footers remain
pinned because they are siblings of the scrolling region. `BottomSheet.Selection` is the explicit
single-choice variant and remains under the same `BottomSheet` export.

Multi-level flows keep their business stack in the feature and render it through
`BottomSheet.PageTransition` inside `Content`.

Increasing depth uses the package's forward push motion, decreasing depth reverses it, and a
same-depth key change cross-fades in place. The transition keeps the outgoing page mounted only for
its exit, disables its pointer/accessibility interaction immediately, and honors Reduce Motion.
Its viewport must have a bounded height, normally supplied by the sheet's `height`.

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

`Composer.Dock` floats a composed input above screen content, applies horizontal and safe-area
insets, follows the keyboard, and reports its measured height. Pair it with
`useComposerDockLayout()` when content above the dock needs the reserved inset, keyboard offset, or
shared live height used by another floating control:

```tsx
const dock = useComposerDockLayout();

<MessageList contentBottomInset={dock.contentBottomInset} renderMessage={renderMessage} />;
<Composer.Dock onHeightChange={dock.handleInputHeightChange}>
  <ComposerSurface />
</Composer.Dock>;
```

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

Visible toolbar actions and pills are tinted rather than left as plain glass. A `GlassView` renders
nothing when it sits on another one — the material has nothing behind it to refract — so an untinted
button on the composer's own surface is invisible, not merely faint. `Composer.Action` resolves the
tint from its `className` and hands it to both branches, which is why callers never pass one. The
morph menu is the exception: its shared trigger/panel surface deliberately keeps the native glass
untinted while retaining `bg-secondary` for non-glass fallbacks.

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

## Background Activities

`@cherrystudio/ui/background-activity` exposes the platform-neutral presentation model and a
registered icon union. Callers supply title, detail, compact label, optional preview, timing, and
one registered icon. They cannot supply children, render functions, arbitrary components, colors,
spacing, typography, or layout overrides. Feature services keep their phase and state machines and
map those values into this presentation model. `BackgroundActivityNativePresentation` adds the
theme and staged-logo fields used only by the host presenter; feature contracts do not expose them.

`@cherrystudio/ui/background-activity/ios` exposes the serializable `expo-widgets` renderer. It owns
the Lock Screen and Dynamic Island layouts, colors, type, spacing, truncation, compact timer/status, logo
placement, and SF Symbol mapping. Feature activity files only register that renderer under their
typed activity name. Infrastructure injects the resolved theme and staged logo and stamps terminal
time. Compact and banner surfaces show their timer when `compactLabel` is absent and replace the
timer with that short status when present. The banner presents `title` and optional `attribution` on its first
row, then the latest single-line `preview` with elapsed time on its second row. Overflow is truncated
from the head so the newest content remains visible. A future Android renderer should consume the
same presentation semantics while owning its own native layout in this package.

The expanded surface repeats the title and attribution header, shows up to three lines of the latest
`preview`, and puts elapsed time at the lower trailing edge. When `compactLabel` is present, banner
and expanded timers both show that short status instead.

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
