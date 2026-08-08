# Design And Icons

## Use The Existing Pipeline

Stop Metro before generators replace asset directories. Run the repository `design:*` commands; do not add a duplicate generator to this Skill. The pipeline must resolve `--desktop-root` or `CHERRY_STUDIO_DESKTOP_ROOT`, validate the desktop and `@cherrystudio/ui` package identities, reject dirty selected sources, and record the desktop commit and SHA-256 hashes.

Keep the desktop checkout read-only. Let `packages/design-tokens/src/sync-manifest.json` own the SVG baseline. Keep catalog routing, manual icon adaptations, and provider fan-out in the broad desktop Manifest.

## Theme Contract

The design tokens are fully forked. Mobile adopted the Vercel Brand Guidelines (Geist) palette, typography, and radii, so both the values under `packages/design-tokens/src/styles/` and the role names in `scripts/theme-contract.ts` are mobile-owned and are never mirrored from desktop. This does not contradict the repo's dual-end criteria: no token name crosses the wire between the two apps, so there is no serialized contract to align — only presentation, which forks.

- `pnpm design:sync` mirrors icons and nothing else. Do not reintroduce mirroring for `theme-contract.ts`, `tokens/`, `tokens.css`, `contract.css`, `shadcn.css`, or `product.css` — the goal is retiring roles mobile does not render, and a sync would reinstate every deleted name. `theme-input.css` was a seventh file here and no longer exists; see the runtime-input note below.
- Regenerate `native.css` with `pnpm design:build` after editing any token source. Keep the `@variant light` and `@variant dark` sets complete and symmetric. Reject missing references, cycles, and unequal variable sets.
- Expose only Shadcn and Cherry product semantic colors through the public Tailwind contract.
- The host layer (`src/frontend/styles/global.css`) carries only what the token package cannot: the React Native `--font-mono` override, the accessibility-step-0 type-scale snapshot, the emoji line-height utilities, and the HeroUI bridge. Product roles belong in the token layer — `settings-grouped-surface` used to be a host override and is now `--grouped-background` / `--grouped-surface`, and the opaque dark background moved there with it.
- Geist's gray ramp is deliberately non-monotonic (`gray-400` is lighter than `gray-300` in light mode; `gray-alpha-400` is fainter than `-300`; `gray-alpha-800` is fainter than `-700` in dark). Map tiered roles such as the four border levels by measured lightness, never by step number.
- Nothing is exempt from the Vercel palette any more. `--brand` reads `green-900`, because Cherry's #00b96b measures 2.58:1 on white and `text-brand` lands on body copy; `--primary` reads `--brand`, `--primary-foreground` reads `--background-100` (white ink on the light-mode green, black on the dark-mode one), and `--ring` mixes `--primary`. The only literal colours left in the contract are `--constant-black` / `--constant-white`, for chrome drawn over photos and camera preview, which must not follow the theme.
- Map HeroUI brand, content, field, and surface semantics to canonical tokens in `src/frontend/styles/global.css`; never patch HeroUI.
- `--primary` and `--brand` are distinct roles that currently resolve to the same value. `--brand` means "this must be the product's green"; `--primary` means "this is the accent, and a theme-colour setting would move it". Use `muted-foreground` for placeholders. Remove retired tokens and utilities instead of aliasing them.
- Bootstrap reads `ui.theme_mode` and `ui.font_size_step` — not `ui.theme_user.color_primary`. No mobile screen has ever written that preference, so the `--theme-primary{,-foreground}` runtime-input pair, the hex fallback to `#00b96b`, and the luminance-based ink picker were deleted along with `theme-input.css`; `--primary` now resolves statically. The preference key stays in `packages/universal` because it is persisted data shared with desktop, so reviving the feature means building the screen first, not restoring a dead default. Variable writes still update the inactive theme first and the active theme last.

## Icon Contract

- Mirror desktop `general`, `models`, and `providers` SVG sets and bytes. Keep SVG sources outside the design-token package.
- Extract model regexes, provider inference, aliases, and catalog entries with the TypeScript AST. Do not parse TypeScript with regexes or line-oriented strings.
- Preserve the mobile virtual adapter `opencode -> general/open-code`; classify it as a legal `mobile-extension`, not a missing provider icon.
- Detect catalog-only icons whose TSX embeds a raster data URI, such as Radeon Cloud. Decode the desktop visual source and generate a 72x72 lossless WebP. Record the source path, source hash, decoded raster hash, output path, and output hash so provenance is auditable.
- Generate all native assets with Sharp `.webp({ effort: 6, lossless: true })` and expose only the format-neutral `IconSource` API backed by static Metro `require()` registries.
- Resolve `currentColor` separately for light and dark foreground. Reuse a light SVG for dark only when no dark SVG exists and the source does not require a distinct `currentColor` rendering.
- Trim transparent padding for provider icons only. Pass an explicit transparent background to Sharp trim so a solid top-left pixel is never treated as removable background.
- Do not create PNG assets or APIs under `packages/ui/src`; reject `icons-png` and `IconPngSource`.

## Provider Fan-Out

Trace every provider or model addition, removal, rename, alias, endpoint, capability, and icon across registry catalogs, seed/default data, schemas and migrations, AI provider configuration and factories, services, icon routing/assets, settings, tests, and i18n. Do not accept an icon-only or registry-only update as complete.

## Cache And Visual QA

Do not trust Fast Refresh or a Metro reload after asset changes because `expo-image` retains memory and disk caches. When needed, stop the app and Metro, run `watchman watch-del-all`, remove `node_modules/.cache`, and start with `pnpm start:clear`.

Export production bundles for iOS and Android. Launch production-equivalent iPhone and Android builds, inspect light and dark modes, and save screenshots under `.context/`. Normalize screenshots to logical pixels before cross-device comparison. Inspect CherryIN, horizontal wordmarks, asymmetric logos, solid top-left backgrounds, transparent padding, dark fallbacks, Radeon Cloud, and provider/model routing.
