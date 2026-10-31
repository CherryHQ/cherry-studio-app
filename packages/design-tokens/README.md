# Design Tokens

This package owns Mobile's color, radius and typography inputs. CSS source contracts live in
`src/styles`; `native.css` is generated. See [Design Spec](../../DESIGN.md) for semantic roles.

## Runtime Palettes

`@cherrystudio/design-tokens/palettes` exposes six accent palettes, their stable IDs, the default
palette, a read-side normalizer, and `createThemePaletteVariables`.

Each palette supplies a readable `light` and `dark` emphasis color plus a `control` fill for both
modes. The shared resolver pairs emphasis with white in light mode and black in dark mode, then
overrides `--primary`, `--primary-foreground`, and `--control-active`. The existing CSS graph derives
focus rings, inline-code emphasis, and HeroUI accent states from those inputs. Neutral surfaces,
links, feedback colors and brand artwork retain their own semantics.

The default green preserves the sRGB output of the authored CSS defaults. Colors are native-ready
hex values so palette swatches and Uniwind consume the same data without a separate converter.
Palette swatches read this registry directly; other product components keep consuming semantic
classes or `useThemeColor`.

To add a palette, add one registry entry and its accessibility name in the settings locale catalogs.
The selection row is derived from the registry. Unknown persisted IDs resolve to green without
rewriting storage. Preference persistence and runtime application belong to the app, not this package.
