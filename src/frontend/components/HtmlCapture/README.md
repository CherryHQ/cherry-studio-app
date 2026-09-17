# HTML Capture

`useHtmlCapture` owns one caller-scoped capture session and its temporary WebView surface. Document
export and HTML-file conversion both use this family. Callers mount `surface` below their opaque
content in a layout container that does not clip offscreen children; the surface must remain laid
out for native capture.

Each source supplies its initial viewport, measurement script and measured page frames. Viewports
use native layout points; frames use physical PNG pixels. Source scripts wait for fonts, images and
stable document layout, then post a request-tagged measurement. The shared surface resizes for each
frame, waits for native layout, injects the frame script and accepts its matching `ready` message
before taking a screenshot. Document export owns semantic pagination and document presentation; files owns
desktop HTML measurement, authored slides, geometric pagination and conversion limits.

The session holds one shared capture lease across both consumers. Active competing requests fail
with `busy`; a request arriving after cancellation waits for the previous physical work to drain.
Pages are captured, delivered and released in order. `onPage` must finish watermark composition and
copying before it returns. Cancellation, timeouts and owner/surface unmount stop further delivery,
but completion waits for an in-flight native capture or consumer callback before releasing the
lease. This keeps backend cleanup from racing a late write. A source can set a per-page timeout, an
overall timeout, or both.

The WebView disables local file access, shared cookies and new windows and permits only its blank
document navigation. Request ids and bounded messages isolate the measurement/ready protocol.
`frontend/utils/capturePng` owns temporary PNG capture, header dimension checks and idempotent native
file release. This family does not own document rendering, watermark policy, persistence, format
fallback, previews or the system share sheet.
