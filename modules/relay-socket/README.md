# Relay socket

An Expo module used only by the desktop connection manager's Relay route. It supplies a
WebSocket-shaped transport to `@cherrystudio/relay-client`; it does not own retries, identity,
authorization or AppState. An old native client without this module keeps direct connectivity
and cannot open Relay connections. Do not ship this native change as an OTA-only update.

The JS adapter limits its queue to 1 MiB / 1024 items, including the one native in-flight
write. It copies caller-owned binary data. A successful native send means the write drained:
iOS uses URLSessionWebSocketTask send completion, Android waits for OkHttp `queueSize() == 0`.
Both reject stalled sends after 15 seconds. Queue overflow, cancellation and native failure
close the socket and discard pending writes. OS/TCP buffers are outside this byte counter.

Native-to-JS delivery allows one outstanding message. JS acknowledges only after synchronous
message handlers run; iOS then calls receive again, while Android unblocks its OkHttp reader.
Failure to consume within 15 seconds closes the connection. This bridge receipt is separate
from Relay protocol ACKs, which still govern the encrypted stream's receive credit.

Only WSS on `/v1/relay` is accepted. System certificate validation stays enabled; redirects,
credentials, query strings and fragments are disallowed. iOS uses an ephemeral session with no
credential or cookie store. A native message is capped at 65,560 bytes, including the Relay
frame header. URLSession applies this before receive completes. OkHttp's public callback
arrives after message assembly, so Android currently rejects oversized messages at callback
delivery; that check does not bound OkHttp's allocation for a hostile oversized wire message.
That native receive limit must be resolved before claiming a complete hostile-peer memory bound.

Binary WebSocket messages stay binary on the network. The Expo bridge uses base64 for each
bounded native transfer; this is not a zero-copy implementation. Validate bridge cost, native
memory, slow networks, TLS rejection and background/resume on both platforms before release.

Native API contracts: [Apple send completion](https://developer.apple.com/documentation/foundation/urlsessionwebsockettask/send(_:completionhandler:)),
[OkHttp WebSocket queue size](https://square.github.io/okhttp/3.x/okhttp/okhttp3/WebSocket.html).
