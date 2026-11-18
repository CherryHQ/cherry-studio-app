# Image Drop Target

iOS system drag-and-drop receiving for the chat composer, discovered by Expo
under `modules/`. Requires a new native build; clients without the module keep
working — the JS wrapper falls back to plain passthrough.

A container view hosting a `UIDropInteraction` that admits only sessions with
image items (`UTType.image`). On drop, each image item's in-place file
representation is copied into `Caches/ImageDropTarget/` before the provider callback returns.
Supported GIF/JPEG/PNG/WebP files keep their original bytes. Other still formats, including
HEIC/HEIF/AVIF, are decoded with orientation correction at a maximum edge of 2048 pixels and
encoded as JPEG. A shared serial queue and per-item autorelease pool bound concurrent transcode
memory across views and drop sessions. Every provider load still starts during `performDrop`;
only work on the local copies is queued. Dimensions are read from image metadata without decoding
the full bitmap. No photo-library permission is involved:
the system delivers the data as part of the user's explicit drag.

Events:

- `onDragEnter` / `onDragLeave` — the drag session entered or left the view
  bounds; JS shows the accept highlight from these.
- `onDropImages` — emitted on every completed drop with
  `{ images: DroppedImage[] }` (possibly empty). Each image carries
  `uri`, `name`, and, when resolvable, `size`, `mediaType`, `width`, `height`.

Android has no system-wide equivalent of inter-app drag sessions for this
scenario; the platform is deliberately out of scope (TODO on the JS side).
An iPad simulator with windowed apps exercises inter-app drags from Photos.
Physical iOS verification (iPad drag from Photos, iPhone drag from Safari) is
still required.
