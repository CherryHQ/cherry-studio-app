# App Identity Assets

`app.json` selects three iOS Home Screen appearances:

| Appearance | Asset | Content |
| --- | --- | --- |
| Light | `icon.png` | Existing red tile with the white Cherry mark |
| Dark | `icon-dark.png` | Cherry red vector mark on transparency; iOS supplies the background |
| Tinted | `icon-tinted.png` | White vector mark on black for system tinting |

Regenerate the 1024 × 1024 dark and tinted PNGs from the existing
`cherry-studio-splash-logo.svg` source with:

```sh
pnpm exec tsx scripts/generateIosIconVariants.ts
```

This only generates assets; it does not build the application. An updated native
installation is required for iOS to receive a changed Home Screen icon configuration.
The startup screen retains its existing `icon.png` artwork in both appearances.

See [iOS permission artwork](permissions/ios/README.md) for in-app permission icons.
