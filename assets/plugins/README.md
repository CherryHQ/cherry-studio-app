# Plugin artwork

`inline-icons.json` contains 48 × 48 PNGs encoded as base64. Native text attachments accept these
bytes synchronously, so inserting or restoring a reference does not depend on downloading an image.
The input and message list use the same artwork.

Sources: `feishu.jpeg` for Feishu, `packages/app-icons/src/icons/github.tsx` for GitHub, and the
installed Lucide `map-pin` / `file-text` paths used by `PluginIcon`. The vectors are rasterized with
a 24 × 24 view box, 2-unit stroke, rounded caps and joins. Only monochrome artwork is tinted; the
Feishu brand colors remain intact.
