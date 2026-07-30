# effortSlider

Discrete effort-level slider with a Skia-rendered "thinking pixel field" that
ignites when the thumb reaches the configured top stop. Ports the Ultracode
track effect from [claude-model-selector](https://github.com/zanwei/claude-model-selector)
(web canvas + CSS, MIT © 2026 Zanwei Guo) to React Native.

The number of stops is entirely driven by `options` — i.e. by how many
reasoning efforts the selected model supports. A model that only exposes
`default`/`max` renders a two-stop slider (endpoints only); a Claude/Gemini
model renders 5–6 detents.

## Architecture

- **Interaction** — `react-native-gesture-handler` Pan + reanimated:
  tap-to-seek, drag magnetism toward stops (`utils/effortSliderMath.ts`, a
  smoothstep pull that bites through the middle of each gap), a 200 ms
  ease-out snap to the nearest stop on release (the original's bouncy spring
  read as too playful — pure deceleration, no rebound), and
  a light `expo-haptics` selection tick on every stop the drag crosses —
  commit fires as soon as a drag crosses onto a new stop.
- **Pixel field** — one SkSL runtime effect (`shaders/thinkingPixelField.ts`)
  draws the background gradient sweep and the flickering cell grid per-pixel
  on the GPU. Uniforms are fed from reanimated shared values via
  `useDerivedValue`; a wrapped clock (`@/frontend/hooks/useShaderClock`) keeps sin()
  arguments small and loops seamlessly every 120 s.
- **Lifecycle** — `hooks/useThinkingReveal.ts` mounts the canvas only while
  the top stop is active (1 s reveal sweep in, 220 ms fade out, then unmount),
  so every other stop costs zero GPU/CPU.

## Theming & accessibility

Light palette matches the original; dark palette keeps hues but flips the
luminance structure (`utils/thinkingPalette.ts` — design-tuning candidates).
With reduced motion the canvas never mounts and the top stop shows a static
gradient; the slider is an `adjustable` accessibility element with
increment/decrement actions.

## Usage

```tsx
<EffortSlider
  options={efforts.map((value) => ({ value, label: t(`chat.reasoning.${value}`) }))}
  value={effort}
  onChange={setEffort}
  pixelFieldValue="max"
/>
```
