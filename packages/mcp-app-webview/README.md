# MCP App WebView Shell

This package owns the browser document used by the native MCP Apps host. It exports a small HTML
factory, so Metro consumes TypeScript directly; there are no downloaded assets, generated bundles,
postinstall scripts, or separate browser dependencies to build.

The native backend owns the official Apps bridge. The document only forwards JSON-RPC between a
sandboxed, opaque-origin iframe and native. Its per-view nonce prevents a child frame from bypassing
the shell through an injected native bridge. Source-window and origin checks exclude nested frames.
Both documents apply CSP before server HTML loads. Network and resource origins come from validated
server declarations. Nested frames, forms, top navigation, popups, custom origins, and browser device
permissions are denied in this mobile implementation. Cookies and native navigation are controlled
by the owning React Native component.

The native host uses CSP meta directives for inline documents. This needs iOS and Android acceptance
alongside their WebView versions before claiming complete Apps host conformance. No web origin or
remote sandbox service is provisioned by this package.
