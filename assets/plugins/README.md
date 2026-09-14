# Plugin artwork

`inline-icons.json` contains 48 × 48 PNGs encoded as base64. Native text attachments accept these
bytes synchronously, so inserting or restoring a reference does not depend on downloading an image.
The input and message list use the same artwork.

Feishu uses `feishu.jpeg`. The fallback uses the installed Lucide `file-text` path, rasterized with
a 24 × 24 view box, 2-unit stroke, rounded caps and joins. Feishu retains its brand colors;
only the generic inline fallback is tinted with the mention color. Amap and DingTalk use this
fallback across plugin pages and chat references; their official artwork is not bundled.

GitHub reuses `resolveProviderIcon('github').light` from the shared UI icon catalog, mirrored from
Cherry Desktop's `packages/ui/icons/providers/light/github.svg`. Its inline PNG is resized from
`packages/ui/src/icons-webp/providers/light/github.webp` so both surfaces use the same mark.

`notion.svg` preserves the `icon-notion` glyph (`U+E690`) from Cherry Desktop's
`src/renderer/assets/fonts/icon-fonts/iconfont.woff2` at commit
`e131f495a9af593ec873bea34b935e97d644f586`, used by the Notion data settings entry.
The glyph uses a 1024-unit view box and an 896-unit ascent; its font coordinates are flipped
vertically for SVG. Sharp rasterizes this source at density 288 into `notion.webp` (72 × 72,
lossless, effort 6) and the `notion` inline PNG (48 × 48).

GitHub and Notion remain monochrome: plugin pages use the neutral foreground, while inline
references select black artwork in light mode and white artwork in dark mode without mention
tinting. The `github-dark` and `notion-dark` PNGs are generated from their light counterparts
with Sharp `.negate({ alpha: false })`, preserving dimensions and transparency.
