# Design And Icons

## Use The Existing Pipeline

Stop Metro before generators replace asset directories. Run the repository `design:*` commands; do not add a duplicate generator to this Skill. The pipeline must resolve `--desktop-root` or `CHERRY_STUDIO_DESKTOP_ROOT`, validate the desktop and `@cherrystudio/ui` package identities, reject dirty selected sources, and record the desktop commit and SHA-256 hashes.

Keep the desktop checkout read-only. Let `packages/design-tokens/src/sync-manifest.json` own the SVG baseline. Keep catalog routing, manual icon adaptations, and provider fan-out in the broad desktop Manifest.

## Theme Contract

Read [Design Spec](../../../../DESIGN.md) and
[UI Development](../../../../docs/guides/ui-development.md) for current presentation decisions.
Mobile owns token values, role names, typography, motion, and the Uniwind/HeroUI bridge. Do not
duplicate palette values or historical preference locations in this skill.

- `pnpm design:sync` mirrors icons only; it must not overwrite Mobile token sources or contracts.
- Regenerate `native.css` through `pnpm design:build` after changing local token sources, then use
  `pnpm design:check`. Do not hand-edit generated CSS.
- Preserve complete light/dark variable sets, resolved references, and an acyclic token graph.
- Keep product roles in the token package and host-only adapters in the app's global styles.
- Follow the current semantic-color and literal-exemption rules in the Design Spec. A desktop
  palette change is not permission to change Mobile branding or restore retired tokens.

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

Fast Refresh or a Metro reload may retain stale `expo-image` memory/disk assets. Diagnose the
specific cache first; stop only the affected workspace's app and Metro when a restart is needed.
Use workspace-scoped cache invalidation and the allocated port. Do not clear every Watchman watch
or disrupt other worktrees. The `start:clear` script also builds workspace packages; include those
effects when planning the action.

Apply the relevant export/device gates in [validation-and-reporting.md](validation-and-reporting.md)
and inspect affected light/dark views. Save screenshots under `.context/` and normalize them to
logical pixels for cross-device comparison. Include horizontal wordmarks, asymmetric logos,
transparent padding, dark fallbacks, embedded raster icons, and affected provider/model routing.
