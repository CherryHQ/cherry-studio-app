# Design Spec

Rules for visual decisions: where colour comes from, how hierarchy is built, when a surface or border is allowed, and where literal values are still permitted.

Interaction component ownership is in [UI Components](docs/references/ui-components.md). The target
contract for competing tap, long-press, scroll, pan, and text-selection interactions is in
[Interaction And Gesture Arbitration](docs/references/interaction-and-gesture-arbitration.md),
which is currently a design rather than an as-built reference. Router structure and safe areas are
in [Navigation And Insets](docs/references/navigation-and-insets.md). Naming is in
[Naming Conventions](docs/references/naming-conventions.md). Local and remote validation ownership
is in [Testing And CI](docs/guides/testing-and-ci.md).

## Priority Order

When requirements conflict, protect in this order:

1. **Readability and accessibility.** Failing contrast is a bug, not a style preference.
2. **Contract integrity.** No bypassing the token layer, no literal colours.
3. **Theme parity.** Whatever is readable in light must be readable in dark, and the reverse.
4. **Hierarchy.** One primary object per screen; the eye knows where to start.
5. **Consistency.** The same interaction looks the same everywhere.
6. **Polish.** Motion, spacing refinements, platform differences.

Earlier items do not yield to later ones.

## Colour

### Single Source

`packages/design-tokens/` is the only origin of colour. Components never write colour literals.

```
tokens/colors/vercel.css   Palette (background / gray / gray-alpha / blue / green / amber / red)
        ↓
shadcn.css                 32 shadcn role names
product.css                46 Cherry product semantics
        ↓
native.css                 Generated. Never edit by hand.
        ↓
components                 className="bg-card text-foreground"  or  useThemeColor('brand')
```

Two ways to take a colour, and only two:

- Prefer `className`: `bg-card`, `text-muted-foreground`, `border-border-strong`, `bg-primary/10`.
- Use the hook when a colour must be passed as a value to a native prop (`ActivityIndicator color`, Skia, `@expo/ui` `Image color`, `Stack.Screen` options):

```tsx
const scrimColor = useThemeColor('scrim');
const [accent, ring] = useThemeColor(['primary', 'constant-white']);
```

`useThemeColor` takes contract names without the `--color-` prefix. A string returns a string; an array returns a tuple of the same length.

Three shadcn names are **HeroUI-reserved and not part of either entry point**: `muted`, `accent`, and `accent-foreground`. HeroUI 1.x uses `accent` for its brand role and `muted` for its secondary-text role, so the app host remaps `--color-accent` and `--color-muted` in `global.css`. The contract variables stay declared for the HeroUI bridge, but there is no `bg-muted` / `bg-accent` utility and `useThemeColor` rejects the names at typecheck. For the meanings Cherry intends, use `secondary` (overlay fill) and `muted-foreground` (secondary text), which remain public.

### Adding A Token

First answer: **does this role already have a name?** Among the 46 product tokens it usually does. If it genuinely does not:

1. Declare the value in `product.css`, pointing at a palette step (`var(--green-900)`), not an oklch literal — unless it must not follow the theme, see below.
2. Add the name to `CHERRY_PRODUCT_VARIABLE_TOKENS` in `scripts/theme-contract.ts`.
3. Run `pnpm design:build` to regenerate `native.css`, then `pnpm design:check`.
4. If it is worth seeing, add it to `packages/ui/stories/foundations/tokens.ts`.

`check.ts` asserts that the contract list and the generated file agree item by item and in order, that every reference resolves, that there are no cycles, and that `@variant light` and `@variant dark` declare exactly the same variable set. A missing dark value is caught there.

### Literal Colours: Four Exemptions

There is no fifth. A new literal must state in its commit which case it falls under, and register its file with that case in the `colorLiteralAllowlist` of `packages/design-tokens/scripts/check-app-theme.ts` — the check scans `src` and `packages/ui/src` for colour literals and fails on any unregistered file (and on registered files whose literals are gone).

| Case | Examples | Why a token cannot serve |
|---|---|---|
| **Chrome over uncontrolled content** | Image viewer, camera preview, thumbnail badges | The backdrop is a photo — neither a light nor a dark surface. `--constant-black` / `--constant-white` already cover this; **use them instead of adding more** |
| **Artwork** | `logoPalette.ts` | Its colors encode relationships with each other, not roles. Changing one breaks the image |
| **Upstream of the tokens** | `brandAvatarStyles.ts`, which picks ink by luminance | Its output *is* the colour decision; reading a token back would be a cycle |
| **Outside the render tree** | `LoggerService` `%c` console styles, build scripts | Never passes through uniwind |

"This colour is fixed by the platform" is **not** on the list. The failure mode of literals is silent divergence: the modal scrim was 40% in one place and 20% in another — two dim levels in one app — until it converged on `--scrim`.

### `--brand` vs `--primary`

Both currently resolve to the same value, but they mean different things:

- `--brand` — "this must be the Cherry logo red (`#ff5757`)."
- `--primary` — "this is the accent, and would follow a theme-colour setting if one existed."

The test: **if the user set the accent to purple, should this turn purple?**

The `--theme-primary` runtime-input layer was removed (`beccaa2e`); mobile has never shipped a screen that writes an accent preference. The preference key stays in `packages/universal` because it is persisted data shared with desktop. Building the feature means adding the screen first, then reintroducing the pair.

### Contrast

Body text (`text-sm` / `text-base`, including semibold) needs **4.5:1**. Graphics and borders need **3:1**.

This is enforced, not aspirational. `--brand` moved off `#00b96b` because that measures 2.58:1 on white while `text-brand` lands on body copy. Compute before choosing.

### The Gray Ramp Is Not Monotonic

Geist's ramp is deliberately non-monotonic; aligning tiered roles by step number inverts the hierarchy in light mode:

- Light: `gray-400` is **lighter** than `gray-300`
- Light: `gray-alpha-400` (.08) is **weaker** than `gray-alpha-300` (.1)
- Dark: `gray-alpha-800` (.47) is **weaker** than `gray-alpha-700` (.54)

The four border tiers therefore skip 300/400 and use 100/200/500/700. **Pick steps by measured luminance, never by number.**

### Monochrome First

Neutral by default. Colour appears only when it carries information — status (success / warning / error / info), selection, brand. Do not turn a number green because it is good news, and do not use colour fields to partition a layout.

Always pair colour with a non-colour cue. Icon shape, wording, or position must convey the same thing on its own.

## Typography

The scale is `sizeSequence` in `packages/ui/src/utils/typography-scale.ts`, 13 steps. The first nine adopt VBG size/leading pairs verbatim:

| Step | Value | Role |
|---|---|---|
| `text-xs` | 13 / 18 | Label, metadata |
| `text-sm` | 14 / 20 | Compact |
| `text-base` | 16 / 24 | Body |
| `text-lg` | 18 / 28 | Lede |
| `text-xl` | 20 / 26 | Subsection |
| `text-2xl` | 24 / 32 | Section |
| `text-3xl` | 32 / 40 | Title |
| `text-4xl` | 40 / 48 | Page title |
| `text-5xl` | 48 / 56 | Display |
| `6xl`–`9xl` | 60 / 72 / 96 / 128 | No assigned role; original values kept |

**This array is also the accessibility ladder.** `resolveTypographyScale` implements FontSizeStep 0/1/2 by shifting the index, so the sequence must stay monotonically increasing and "+1 step" must remain "the next size up". Editing it changes accessibility behaviour. **Editing the CSS does nothing — edit the array.**

Three weights only: `font-normal` (400), `font-medium` (500), `font-semibold` (600). `font-bold` is remapped to 600 and is identical to `font-semibold`; semibold is the heaviest role in the system. Never write a numeric `fontWeight`.

`font-mono` (Geist Mono) is for code, commands, paths, raw tokens, timestamps, and short identifiers. **Never set a full sentence or an entire table in mono.** The font is embedded at build time by the expo-font plugin in `app.json` — changing fonts requires a `prebuild` and a native rebuild; a Metro reload will not show it.

Build hierarchy with typography first, then spacing, and only then surfaces. Peer elements share role, size, weight, and leading: **do not restyle one because its string is longer or its number is larger.**

## Shape And Spacing

Radius has one source: `--radius` = 8px. `rounded-sm` through `rounded-4xl` are all derived in `build-native-css.ts` as `calc(var(--radius) * n)`. The four sub-pixel hairline steps (`rounded-4xs` … `rounded-xs`) are the exception — they are not on the scale and are authored individually.

**Never write a numeric `borderRadius`.** A new step means changing a multiplier, not bypassing the system in a component.

Spacing uses the default Tailwind scale, which already matches the intended 4/8/12/16/20/24/32/40/48/64 with no conversion.

Every gap has exactly one owner: if the container sets `gap`, children do not add their own margins. Fixing an awkward gap means changing the grouping or the owner, not adding a one-off margin.

## Surfaces And Borders

The interface is one continuous surface by default. **A surface or a border has to earn its place** — it must express selection, interactivity, a warning, or a real grouping that spacing cannot convey.

Reach for them in this order: spacing → alignment → typography → density → and only then borders and surfaces.

Do not wrap every section in a card, and never nest cards. The four border tiers (`border-subtle` < `border` < `border-strong` < `border-selected`) are monotonic in both themes; choose by meaning, not by eye.

When a screen feels cluttered, separate **volume** from **loudness**. Volume is fixed by removing, merging, or reordering content. Loudness is fixed by reducing competing colours, sizes, weights, borders, surfaces, and motion. Keep one deliberate anchor — restraint is not flattening everything into having no focus.

## Motion

Still by default. Motion is justified in three cases: explaining a state change, preserving continuity, and confirming an action.

No scroll-triggered reveals, no decorative pulsing, no parallax, no hover displacement. **The base experience must be complete with zero motion**, and `useReducedMotion` must actually be wired, not merely imported.

Existing heavy animations (the image-generation prism sweep, the logo draw-on, the settings droplet collapse) are deliberate one-off investments. `useReducedMotion` is currently wired in `PrismSweep`, `ImageGenerationLoader`, `SlotText`, and `EffortSlider` — follow those when adding anything at that scale, and first say what it explains.

## Icons

General-purpose UI icons are Lucide SVG components adapted by `@cherrystudio/app-icons`. Import each icon from its deep path, for example `@cherrystudio/app-icons/icons/check`; the package root exports types only so Metro never traverses the complete Lucide icon set. In `className`, `size-*` sets the dimensions and `text-*` sets the stroke color; explicit `size`, `width`, `height`, and `color` props win over `className`.

To add an icon, add one small adapter under `packages/app-icons/src/icons/` that default-imports the matching `lucide-react-native/icons/*` module and exports `createIcon(...)`. Do not add icon barrels, native glyph registries, fonts, or generated PNG/WebP variants. Provider and model brands, avatars, logos, charts, and content images remain image assets rather than Lucide icons.

Icons are not decoration. Do not place them in coloured tiles and do not add them to fill space. Prefer words where words are clearer.

## Rejected

None of the following is accepted:

- **Hardcoded colours**, unless the change falls under one of the four exemptions and says so in the commit.
- **Ternaries whose branches are identical** — `isActive ? 'text-foreground' : 'text-foreground'`. Either make it differ or delete it along with the prop that feeds it.
- **Shipping a visual change verified in one theme only.**
- **Patching weak hierarchy with a border.** Unclear hierarchy is a typography and spacing problem; a border only hides it.
- **Decorative gradients, glows, textures, faux depth, skeuomorphic paper.** A gradient is valid only as a labelled continuous data scale.
- **The same role holding different values in different files.** On finding a divergence, converge on one token; do not copy one of them over the other.
- **"Desktop has it" as a reason.** The test is whether the thing is serialized: serialized shapes (part JSON, DB schema, DTOs) must align; values, interaction, and visuals may diverge. State the real reason in the commit, and check whether the desktop code is dead before aligning to it. See [Universal Package](docs/references/universal-package.md).
- **Working around `check.ts`.** What it blocks is a real problem, not noise.

## Gates

Token changes:

```bash
pnpm design:build          # regenerate native.css
pnpm design:check          # contract + app theme + icons
```

Any visual change:

```bash
pnpm typecheck:app
pnpm test:app -- <pattern>  # affected suites only
pnpm lint
pnpm format:check
```

Before opening a draft PR, follow the complete local gate in
[Testing And CI](docs/guides/testing-and-ci.md). If the draft changes later, rerun that gate on the
final head before marking it ready. The full test suite then runs in remote CI.

**Plus: look at it in both light and dark on a device or simulator.** Structural verification is not the same as having seen it — contrast, hierarchy, and how a colour reads against real content only show up on screen.

`pnpm design:sync` syncs icons only. `packages/design-tokens/src/styles/` and `scripts/theme-contract.ts` are mobile-owned in both names and values: no token name is ever serialized between the two apps, so there is no contract to align — only a presentation layer that would diverge. Restoring the sync would reinstate every deleted name.

## Seeing The Current State

The Storybook `Foundations/*` stories render the full palette, semantic groups, surface/foreground pairs, the type scale, weights, radii, and border tiers on device. After changing a token, look there rather than reading CSS.

`packages/ui/stories/foundations/tokens.ts` holds the list those stories read, and `__tests__/tokens.test.ts` checks it against the build output — a misspelled name does not throw at runtime, it just renders a placeholder, and that test is the only thing that catches it.
