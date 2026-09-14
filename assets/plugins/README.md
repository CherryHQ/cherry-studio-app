# Plugin artwork

`inline-icons.json` contains 48 × 48 PNGs encoded as base64. Native text attachments accept these
bytes synchronously, so inserting or restoring a reference does not depend on downloading an image.
The input and message list use the same artwork.

Feishu uses `feishu.jpeg`. The fallback uses the installed Lucide `file-text` path, rasterized with
a 24 × 24 view box, 2-unit stroke, rounded caps and joins. Only monochrome artwork is tinted;
Feishu and Amap retain their brand colors.

GitHub reuses `resolveProviderIcon('github').light` from the shared UI icon catalog, mirrored from
Cherry Desktop's `packages/ui/icons/providers/light/github.svg`. Its inline PNG is resized from
`packages/ui/src/icons-webp/providers/light/github.webp` so both surfaces use the same mark.

`amap.webp` comes from the [official Amap logo](https://a.amap.com/pc/static/img/amaplogo.png)
referenced by [Amap Open Platform](https://lbs.amap.com/), retrieved on 2026-09-14.
Sharp resizes the original PNG into the 72 × 72 lossless WebP (effort 6) and the 48 × 48 inline PNG.

`notion.svg` preserves the `icon-notion` glyph (`U+E690`) from Cherry Desktop's
`src/renderer/assets/fonts/icon-fonts/iconfont.woff2` at commit
`e131f495a9af593ec873bea34b935e97d644f586`, used by the Notion data settings entry.
The glyph uses a 1024-unit view box and an 896-unit ascent; its font coordinates are flipped
vertically for SVG. Sharp rasterizes this source at density 288 into `notion.webp` (72 × 72,
lossless, effort 6) and the `notion` inline PNG (48 × 48). Both are tinted with the foreground
or mention color so the same artwork follows the current theme.
