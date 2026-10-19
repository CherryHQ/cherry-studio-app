# AI Behavior Contracts

This suite protects the model-backed `AiService` behavior used during refactoring. It exercises the
real `AiService -> ai-core` image path against the AI SDK V3 mock model interface from `ai/test`.
Image requests resolve their connection and build only image parameters. It does not emulate
provider HTTP endpoints or SSE wire formats.

## Ownership

- `AiService.generateImage.test.ts` owns the model-backed image entry point.
- Provider capabilities, provider-native tools, message rules, tool approval, MCP transport, and
  `listModels` remain owned by their existing focused suites.

The harness temporarily replaces the global `openai-compatible` extension. Run this directory in
band, never use `test.concurrent`, and always restore the extension after each test. Both
`globalThis.fetch` and `expo/fetch` are guarded so an unexpected network request fails immediately.

## Snapshot Policy

Model call options are projected into stable data before snapshotting. Runtime functions, object
identity, and timing values are deliberately excluded. Critical fields also have explicit assertions.

Snapshots describe existing behavior. A refactor-only change must not update them. If intended
behavior changes, update the explicit assertions and snapshots in a separate behavior-change commit.
Do not delete an older wiring test until an equivalent behavior contract is passing and its ownership
is documented here.

Run the suite with:

```sh
pnpm test:ai-contract
```
