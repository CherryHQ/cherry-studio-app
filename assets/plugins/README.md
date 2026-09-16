# Plugin artwork

All six bundled plugins use local brand artwork in the plugin list, detail/connect pages,
chat picker, composer references, and sent-message references. Unknown plugins retain the
Lucide `file-text` fallback. Images never require a network request at runtime.

## Presentation

[Light and dark artwork preview](presentation.png) shows the frame and optical scale at several
sizes. It is a static design sheet, not an application screenshot or device-acceptance result.

`PluginIcon` uses CherryUI `Avatar` for one shared rounded-square frame: `bg-card`, a
1 pt `border-border` outline, continuous corners, and no shadow. The same frame treatment
applies to every plugin and the unknown-plugin fallback. Its neutral surface follows the theme.
This frame groups brand identities; it is not a new treatment for general-purpose UI icons.

| Context | Size | Frame | Corner token |
| --- | --- | --- | --- |
| Chat picker | `small` | 24 × 24 pt | `rounded-md` |
| Plugin list | `default` | 40 × 40 pt | `rounded-xl` |
| Detail / connection identity | `large` | 48 × 48 pt | `rounded-2xl` |

Marks are centered and keep their aspect ratio. Transparent source padding is trimmed first;
`optical-scales.json` then owns each mark's longest dimension as a fraction of the frame.
The compact monochrome marks are smaller; the narrow, wide, and outline marks are larger.

| Mark | Scale | Reason |
| --- | --- | --- |
| Amap | 70% | Standalone navigation arrow, without the old map backplate |
| DingTalk | 80% | Narrow, tall silhouette |
| Feishu | 76% | Wide silhouette |
| GitHub | 62% | Dense, high-contrast silhouette |
| Notion | 60% | High-contrast square outline |
| WeCom | 76% | Light, open outline |

- Preserve brand paths and colors. Amap's original arrow paths are extracted from the official
  SVG without its map background or shadow; Feishu's favicon plate is removed during generation.
- GitHub and Notion use `foreground` in both themes. The other four keep their brand colors.
- Inline references scale with text. Their 48 × 48 PNG attachments include the same neutral
  frame, optical scales, and theme colors, using the 24 pt frame's radius and border proportions.
  Only the unknown-plugin inline fallback remains an unframed, mention-tinted file icon.
  The composer and messages share `getPluginInlineIcon`; both retain their existing 80% icon opacity.
- Names remain beside the icons; the artwork does not duplicate the accessible label.

## Sources

Official web assets were retrieved on 2026-09-16. Brand artwork remains owned by its respective
brand; bundling it does not imply endorsement.

| Plugin | Source | Local original |
| --- | --- | --- |
| Amap | [Amap Open Platform](https://lbs.amap.com/), [header SVG](https://lbs.amap.com/public/img/header/logo_2023.svg) | `amap.svg`: original arrow paths `path-79` through `path-91`, with their masks and transforms |
| DingTalk | [DingTalk Open Platform](https://open.dingtalk.com/), [SVG favicon](https://img.alicdn.com/imgextra/i3/O1CN01WMvMRG1ks3Ixc9x1v_!!6000000004738-55-tps-32-32.svg) | `dingtalk.svg` |
| Feishu | [Feishu Open Platform](https://open.feishu.cn/), [SVG favicon](https://lf-package-cn.feishucdn.com/obj/feishu-static/lark/open/website/favicon-logo.svg) | `feishu.svg` |
| GitHub | Shared desktop-aligned [provider artwork](../../packages/ui/icons/providers/light/github.svg) | Shared SVG, unchanged |
| Notion | Cherry Desktop's `icon-notion` glyph (`U+E690`), commit `e131f495a9af593ec873bea34b935e97d644f586` | `notion.svg`, unchanged |
| WeCom | [Tencent's WeCom page](https://www.tencent.com/zh-cn/products/wecom/), [SVG icon](https://www.tencent.com/wp-content/uploads/2022/12/wecom-1.svg) | `wecom.svg` |

The Notion glyph uses a 1024-unit view box and an 896-unit ascent, with font coordinates flipped
vertically for SVG. The existing inline fallback preserves the Lucide `file-text` raster.

## Regeneration

Run `pnpm exec tsx scripts/generatePluginIcons.ts` from the repository root. This converts local
artwork only; it does not download assets or build the app. Sharp crops transparent margins,
fits each mark into a 144 × 144 transparent square, and writes lossless WebP for page icons.
The component applies the shared optical scale at display time. The generator also composes
48 × 48 PNG attachments for both themes in `inline-icons.json`, reading `card`, `border`,
`foreground`, and the radius from the design-token package. Its color conversion is deliberately
limited to neutral OKLCH values; a non-neutral frame token requires an explicit generator update.
Regenerate these attachments after changing those tokens or the optical scales. The original
brand SVGs do not change when the theme changes.

When adding a plugin, add its local source and optical scale to the generator, its inline entry in
`src/frontend/utils/pluginIcons.ts`, and its page asset in `PluginIcon`. `PluginIconId` keeps
the page and inline maps aligned; composer link styles are derived from the inline map.
