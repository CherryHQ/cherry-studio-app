# Design And Icons

## Use The Existing Pipeline

Stop Metro before generators replace asset directories. Run the repository `design:*` commands; do not add a duplicate generator to this Skill. The pipeline must resolve `--desktop-root` or `CHERRY_STUDIO_DESKTOP_ROOT`, validate the desktop and `@cherrystudio/ui` package identities, reject dirty selected sources, and record the desktop commit and SHA-256 hashes.

Keep the desktop checkout read-only. Let `packages/design-tokens/src/sync-manifest.json` own the canonical design token, CSS, contract, and SVG baseline. Keep catalog routing, manual icon adaptations, and provider fan-out in the broad desktop Manifest.

## Theme Contract

- Mirror desktop `tokens/`, `tokens.css`, `contract.css`, `theme-input.css`, `shadcn.css`, `product.css`, and `theme-contract.ts`.
- Generate `native.css` with complete, symmetric `@variant light` and `@variant dark` sets. Reject missing references, cycles, and unequal variable sets.
- Expose only Shadcn and Cherry product semantic colors through the public Tailwind contract.
- Keep mobile-only presentation in the host layer, including the opaque dark background and `settings-grouped-surface`.
- Map HeroUI brand, content, field, and surface semantics to canonical tokens in `src/frontend/styles/global.css`; never patch HeroUI.
- Use `primary` for business brand color and `muted-foreground` for placeholders. Remove retired tokens and utilities instead of aliasing them.
- Read `ui.theme_mode` and `ui.theme_user.color_primary` at startup. Fall back invalid primary colors to `#00b96b`, choose black or white foreground from brightness, update the inactive theme first, and update the active theme last.

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
