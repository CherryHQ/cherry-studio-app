# OnboardingScreen

Onboarding entry (route: `/onboarding`, registered headerless in
`src/app/_layout.tsx`). Currently a skeleton that centers the brand-logo draw
animation; the real onboarding content lands later.

## logoDraw

`logoDraw/` is the paint-on reveal of the brand logo: the two orange swirls
draw first as one continuous gesture, then the green check lands with a
spring. Public surface is `LogoDrawAnimation` (see `logoDraw/index.ts`).

### How it works

The logo SVG consists of *filled outlines*, not strokes, so a classic
dash-offset trick cannot draw it. Instead each fill path renders inside an
alpha `<Mask>` whose content is a thick round-cap stroke growing along a
hand-reconstructed centerline of the original pen stroke (Skia `Path`
`end`-trim). The visible pixels always come from the original fill path —
the mask only controls how much is revealed — so `progress = 1` is
pixel-identical to the brand SVG. After the internal timeline settles, the
component swaps to unmasked fills (drops three saveLayers).

A single master `progress` shared value drives everything through
`useDerivedValue` sub-segment mappings (`LOGO_DRAW_SEGMENTS`), so all
per-frame work stays on the UI thread via Skia's Reanimated integration.

### Geometry reverse-engineering (logoPaths.ts)

- Both swirls are ~12-unit-thick ring strokes: outer rim r≈17.05, inner
  edge = an r≈4.94 circular *hole* concentric with each ring center (the
  small circles are negative space — verified by ray casting, easy to
  misread as filled discs).
- Centerlines are radius-11.1 arcs around the ring centers plus a cubic
  waist for the right swirl; stroke width 12.6 covers the radial band with
  margin. Builders live in `logoDrawMath.ts` (pure, unit-tested).
- Each ring is a near-closed hook with a ~6-unit *mouth* at its top (between
  the interlock lip and the arch that leads to the waist). A round mask nib
  (half-width 6.3) placed inside a mouth bridges it and reveals the far arch
  as a sliver detached from the growing blob — it only rejoins ~0.3 later
  when the sweep comes all the way around, so it reads as a floating extra
  stroke. The right sweep therefore starts at 231° (`LOWER_RIM_FROM_DEG`),
  just below the mouth: the start nib covers the interlock lip (and sits 3.6
  units from the C's bottom lip, so the handoff still reads) yet stays 7.8
  units from the arch, keeping every revealed frame a single connected blob.
  There is no separate cap lead-in — that lead-in was what used to drag the
  nib through the mouth. Verified by an offline rasteriser (flatten the fill
  polygon, intersect with the trimmed thick stroke, count connected
  components): 0 detached components across all trims.

### Calibrating after geometry changes

`LogoDrawAnimation` takes a controlled `progress` shared value, which is the
scrubbing seam for recalibration — drive it from a temporary slider (or a
grid of fixed-progress instances, one `useSharedValue(p)` per cell, for a
single before/after screenshot) and step through ~0.05 increments. At every
step no fill may appear outside the growing mask corridor's leading edge, and
the corridor must fully cover each shape by its segment end. To see the
corridor itself, temporarily render each centerline as a translucent
`<Path style="stroke">` with the matching trim next to the masks. The
deterministic check for detached slivers is the offline rasteriser described
above (flatten fill polygon ∩ trimmed thick stroke → count components).
