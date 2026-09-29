# effortSlider

Discrete effort-level slider used by the chat composer's gauge overlay. Its
two-layer capsule, stop dots, and circular thumb follow the ChatGPT
iOS interaction reference.

The number of stops is entirely driven by `options` — i.e. by how many
reasoning efforts the selected model supports. A model that only exposes
`default`/`max` renders a two-stop slider (endpoints only); a Claude/Gemini
model renders 5–6 detents.

## Architecture

- **Interaction** — `react-native-gesture-handler` Pan + Reanimated:
  tap-to-seek, drag magnetism toward stops (`utils/effortSliderMath.ts`, a
  smoothstep pull that bites through the middle of each gap), a 200 ms
  ease-out snap to the nearest stop on release, and a light `expo-haptics`
  selection tick on every crossed stop. Commit fires as soon as the active
  stop changes.
- **Geometry** — the sampled reference is a 64dp outer capsule with a centered
  44dp progress pill, a 36dp thumb, and 10dp stop dots. Stop
  dots share the thumb's endpoint centers, derived by
  `getEffortSliderTrackGeometry`, so two-stop and six-stop models stay aligned.
  The chat overlay centers its label-and-track panel in the live viewport, so
  keyboard and composer movement do not shift its resting position.
- **Visuals** — the opaque outer capsule and its exposed stop dots use the
  theme's `popover`/`popover-foreground` pair: white in the light theme and a
  raised dark surface in the dark theme. The overlay adds a soft shadow outside
  its animated clip, keeping the capsule distinct from the blurred content.
  A local focus field extends 96dp above the label and below the track, fading
  into the surrounding content at both edges. iOS adds nested native blur bands
  toward the panel without masking the blur; Android uses the same theme-colored
  dissolve over its scrim fallback. App and keyboard backdrops share the field's
  screen coordinates, with the keyboard portion clipped to its own window.
  The progress pill uses `primary`; the thumb and translucent dots use its
  paired `primary-foreground`.

## Motion

- **Gauge morph** — tapping the gauge morphs its frame into the slider capsule
  over 150 ms; dismissing reverses it over 250 ms, both on `easing.settle`. The
  track stays at its resting size inside the morphing clip, so the morph crops
  it instead of re-laying it out each frame, and the track is visible only over
  the second half of the progress: it fades out early when closing and in late
  when opening.
- **Effort label** — the label above the track shows only the effort level and
  appears settled when the overlay opens. Each level change rotates it with
  `TextAnimation.Rotating`: raising the level brings the new label in from
  below, lowering it brings the new label in from above, so the direction
  reports the change. A reversal mid-change continues from the current position.

## Theming & accessibility

Reduced motion skips programmatic thumb animation, the gauge morph, and the
label rotation; the slider and label change in place. The slider remains an
`adjustable` accessibility element with increment/decrement actions and a
localized current-value label.

## Usage

```tsx
<EffortSlider
  options={efforts.map((value) => ({ value, label: t(`chat.reasoning.${value}`) }))}
  value={effort}
  onChange={setEffort}
/>
```
