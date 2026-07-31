# SlotText

`SlotText` renders tactile roll transitions for short, single-line labels, statuses, and counters.
It is a controlled React Native component backed by Reanimated; changing `text` rolls each changed
grapheme from the previous committed value to the latest value.

## Public Interface

Import `SlotText` and its public types from `@/frontend/components/SlotText`.

```tsx
<SlotText
  text={saved ? 'Saved' : 'Save'}
  textClassName="font-semibold text-foreground text-sm"
/>
```

The component accepts animation timing, stagger, bounce, typography, accessibility, and
font-scaling props. Defaults tuned for snappy status labels: `200ms` glyph duration, `45ms` stagger,
`24ms` entry offset, and `0.6` bounce. Glyphs always roll downward, and incoming glyphs land
tinted with the brand highlight (`slotTextHighlightColor` in `src/frontend/utils/constants.ts`) before
fading to the regular text color over `colorFadeDurationMs`.

`skipUnchanged` (default `true`) keeps a grapheme static only when it is unchanged *and* its slot
offset is stable — the measured widths of all preceding slots sum to the same value before and after
the transition. Stable prefixes (`Copy` → `Copied`) and same-width digit columns (`12:45` → `12:46`)
stay put, while coincidental same-index matches (the `p` in `In progress` → `Complete`) roll with
the rest of the line instead of lingering and drifting sideways during the width change.

Each changed grapheme uses two native faces, following the same slot structure as
`react-native-slot-numbers`: the outgoing and incoming faces translate vertically while scaling,
fading, and rotating in depth. Grapheme dimensions are measured in a separate hidden layer so the
animated slot width never constrains the measurement.

## Usage Boundary

- Keep values to one short line. The default maximum is 32 graphemes; longer values render as one
  static `Text` node and warn in development.
- Reduced-motion preferences and invalid numeric animation props also use the static path.
- `Intl.Segmenter` keeps combining marks and joined emoji together when the runtime provides it;
  older runtimes fall back to Unicode code points.
- Per-grapheme rendering intentionally gives up kerning and ligatures. Do not use it for Markdown,
  paragraphs, streamed chat content, or scripts that require shaping across adjacent characters.
- `textClassName` and `textStyle` are applied to every grapheme, so they should contain typography
  and color styles rather than per-element spacing or backgrounds.

The module does not own temporary flash state. Callers should update their own controlled `text`
value when they need a `Save` to `Saved` to `Save` interaction.
