# OnboardingScreen

First-use setup lives in the `/onboarding` native stack: welcome → provider → connection →
chat model. The welcome page is headerless; subsequent pages retain native back navigation.
Buttons are available while the existing logo reveal runs.

## Setup Ownership

- App Shell's `FirstUseGate` checks `app.onboarding.status` before chat restoration. An unseen
  installation with saved models or Sessions keeps its existing entry behavior. New users can
  skip. Chat greetings and empty states contain no onboarding or provider-connection entry.
  Later provider configuration stays in the regular settings flow, including its model import.
- Provider catalog and connection routes reuse the provider page's saved entities and form
  state through an explicit route-owned `setupIntent` prop, not a URL parameter. Presets show the
  API key first and fold name/base URL into advanced settings. Custom services show one address
  and a protocol picker; saved custom services remain selectable after leaving setup.
- `model/` combines saved models and a cancellable remote preview, filters to supported chat
  models, and accepts a manual model ID when listing is unavailable. Only the selected model
  is imported. It calls `models.checkChat`, not the AI SDK health check.
  Listing failures are separate from successful empty results: the screen shows a translated
  error category and recovery action, never raw provider errors. Saved models remain selectable.
- Completion requires an actual response from the bound conversation Runtime. It then enables
  the model/provider, reuses the seeded Agent when possible, saves `agent.default_model_id` and
  the completed status, and opens a draft chat. Fast/translation defaults are unchanged.
- Cancellation/blur stops the probe and prevents subsequent navigation. Failed checks keep
  saved connection/model data for retry without completing onboarding or changing defaults.
  The probe sends no history or tools and may incur a small provider charge, disclosed beside
  the start button. Credentials stay in the existing provider storage flow, never route params.

## LogoDraw

`components/LogoDraw/` is the paint-on reveal of the brand logo: the two orange swirls
draw first as one continuous gesture, then the green check lands with a
spring. Its page-local surface is `LogoDrawAnimation` (see `components/LogoDraw/index.ts`).

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
