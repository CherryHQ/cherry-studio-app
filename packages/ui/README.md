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
metadata, the file's kind, localized unavailable/opening labels, and an error callback; the
component owns the frame, the press target, unavailable states, system opening, and iOS Quick Look
thumbnail caching. Loading placeholders belong to the caller because it owns the loading lifecycle:

```tsx
<FilePreview
  file={{
    displayName: 'brief.pdf',
    extensionLabel: 'PDF',
    id: 'file-1',
    kind: 'pdf',
    revision: 4,
    uri: 'file:///documents/brief.pdf',
  }}
  labels={{ openWith: 'Open with', unavailable: 'Unavailable' }}
  onError={(error, operation) => reportPreviewError(error, operation)}
/>;
```

Rendering is plugin-based and `kind` is an open set. CherryUI ships an `image` renderer and falls
back to the platform preview — an iOS Quick Look thumbnail, an Android extension card — for every
kind no plugin claims, so a caller may classify files more finely than any renderer handles.
`FilePreviewPluginProvider` registers renderers for the previews beneath it:

```tsx
// A module constant, because `plugins` is a memo dependency.
const previewPlugins = [{ component: PdfPreview, kind: 'pdf' }];

<FilePreviewPluginProvider plugins={previewPlugins}>
  <AttachmentGrid />
</FilePreviewPluginProvider>;
```

A plugin receives `FilePreviewComponentProps` — the file, the resolved size, and the same `onError`
— and draws the preview only. The frame, press target, and system opening stay with `FilePreview`,
so a plugin cannot diverge on interaction. Providers nest: an inner one overrides the kinds it
names and inherits the rest, including the platform fallback.

The built-in table stays deliberately small. A renderer ships here only when it needs nothing
beyond `file.uri` and a platform API, as `image` and the iOS Quick Look thumbnail do. Anything that
parses a format or calls a service is product code and registers through the provider; see
`src/frontend/components/FileEntryPreview/README.md` for that path.

`onError` distinguishes `open` from `thumbnail`, allowing product code to alert for a failed open
while treating thumbnail generation as a recoverable fallback. CherryUI carries no file database,
logging, or translation dependency.

`MarkdownText` is the shared GitHub-flavored Markdown renderer. Static content uses the enriched
native renderer. A part that has streamed keeps the streaming renderer for its full mounted
lifetime, including terminal state, so completion does not remount its native subtree. Both receive
the same theme tokens, syntax palette, LaTeX flags, and typography scale. Product code supplies the
active font size step and decides how links open:

```tsx
<MarkdownText
  fontSizeStep={fontSizeStep}
  isStreaming={isStreaming}
  markdown={markdown}
  onLinkPress={openLink}
/>;
```

When rendering selectable content inside a scroll surface, follow the selection and
scroll-cancellation contract in
[Interaction And Gesture Arbitration](../../docs/references/interaction-and-gesture-arbitration.md)
and verify the native interaction boundary on each supported platform.

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

`ContentState` is the platform-neutral Loading, Empty, and Error family for content surfaces. Its
explicit variants avoid boolean state combinations while sharing the content hierarchy, optional
icon, and up to two actions. Loading uses CherryUI `Spinner`; actions use CherryUI `Button`.
Product code keeps query state, retry behavior, list mounting, and localized copy:

```tsx
<ContentState.Error
  description={error.message}
  primaryAction={{ children: t('common.retry'), onPress: () => void refetch() }}
  title={t('common.loadFailed')}
/>;
```

Keep screen, list, composer, and card insets in the consuming feature and compose the state inside
that layout. `ContentState` deliberately has no query, retry, inset, card, or compact-mode props.

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

`ActionMenu` and `ContextMenu` are the shared native action menus. Each accepts one trigger element
and a flat, stable `items` array; the package owns Nitro wiring, native action dispatch, and the
menu's recognition ownership. Call sites express which interaction they mean by choosing the
component instead of configuring a trigger:

```tsx
import {
  ActionMenu,
  ContextMenu,
  ContextMenuScrollBoundary,
  type MenuItem,
} from '@cherrystudio/ui/components';

const items = [
  { id: 'rename', label: 'Rename', onPress: rename },
  { destructive: true, id: 'delete', label: 'Delete', onPress: remove },
] satisfies readonly MenuItem[];

// A tap-triggered dropdown: the tap is button behavior the menu owns outright.
<ActionMenu items={items}>
  <MoreButton />
</ActionMenu>;

// A long-press contextual menu that keeps the child's normal tap behavior.
<ContextMenu items={items}>
  <MessageRow />
</ContextMenu>;

// The scroll owner exposes drag and momentum state to every descendant context menu.
<ContextMenuScrollBoundary>
  {(scrollHandlers) => <ScrollView {...scrollHandlers}>{rows}</ScrollView>}
</ContextMenuScrollBoundary>;
```

Item IDs must be unique within a menu. `checked` is controlled; omitting it creates a regular
action, while `false` and `true` create off and on check states. An empty array returns the child
unchanged. Both platforms render text actions; iOS uses `UIMenu` / `UIContextMenuInteraction`, while
Android uses `PopupMenu`. Each keeps the system style for destructive items. Expo Router page
previews remain owned by `Link.Preview` / `Link.Menu`, not these components.

Wrap every scroll component containing an Android `ContextMenu` in one
`ContextMenuScrollBoundary`. The boundary supplies drag, momentum, and touch handlers through its
render callback without rendering another native view. Pass an existing scroll handler to the
boundary itself when it needs to be composed with menu arbitration. A touch that only stops
momentum stays ineligible for a context menu until that touch ends. On iOS the supplied handlers are
forwarded unchanged because UIKit already owns menu arbitration. On Android, a custom trigger
component must forward `accessibilityActions` and `onAccessibilityAction` to its accessible native
target.

`ContextMenu` recognition follows
[Interaction And Gesture Arbitration](../../docs/references/interaction-and-gesture-arbitration.md):
on iOS the system `UIContextMenuInteraction` owns the long press and its coordination with scroll
ancestors; on Android the long press is a `react-native-gesture-handler` recognizer in the shared
gesture arena, so committed scrolling and pan gestures cancel it, and the native view only presents
the already-arbitrated menu. Recognition timing and touch slop come from Android
`ViewConfiguration`, including the user's system long-press timeout. On Android the enabled items
are also exposed as accessibility custom actions on the trigger child, so the contextual operations
do not depend on long press; iOS accessibility stays with the system interaction. Verify changed
gesture boundaries on a device — the arbitration reference is `Status: design` and JavaScript tests
cannot prove recognizer timing.

The native implementation is adapted from MIT-licensed Nitro menu projects. See
[third-party-notices.md](third-party-notices.md) for the complete attribution and license text.

`BottomSheet` is the shared height-regulated mobile sheet. Its public API, ownership, dismissal,
height, nested-page, and platform behavior live in the colocated
[Bottom Sheet reference](./src/components/bottom-sheet/README.md).

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

`Composer.Dock` applies horizontal and safe-area insets and follows the keyboard. It floats above
screen content by default. Use `layoutMode="flow"` when the parent should reserve its space through
normal flex layout; this avoids measuring the dock back into React state. Pair the floating mode
with `useComposerDockLayout()` when content behind the dock needs the reserved inset, keyboard
offset, or shared live height used by another floating control:

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

Only platform-divergent material and text metrics use `.ios` / `.android` files. Layout, state, and
collapse behavior stay shared. `Composer.Input` forwards every paste to `onPaste`; the caller decides
which payloads to use.

Rows above the field follow composition order rather than named slots. Use `Composer.Collapsible`
only when a conditional row should animate the surface height:

```tsx
<Composer.Collapsible>
  {isSearching ? <StatusPill label={t('chat.search.running')} /> : null}
</Composer.Collapsible>
```

The package deliberately ships no attachment strip; callers compose their own row and pass its
presence through `canSend`. `Composer.Menu` is private to the composer and supports nested content:
use `closeOnPress={false}` for an item that replaces the panel contents. `width` is a floor, and
callers that need most of the screen must bound their children to the window.

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
own, which is what `composer.motion.ts` does. This vocabulary covers package components; app-local
easings remain outside it.

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
from the head so the newest content remains visible.

The expanded surface repeats the title and attribution header, shows up to three lines of the latest
`preview`, and puts elapsed time at the lower trailing edge. When `compactLabel` is present, banner
and expanded timers both show that short status instead.

## Storybook

Stories are development-only assets outside the runtime source tree. Their ownership, structure,
application adapters, and commands live in the [Stories Guide](./stories/README.md).

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
