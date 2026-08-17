# Assistant Toolbar Simplification Design

## Goal

Reduce incidental structure and repeated test setup in PR #556 without changing assistant toolbar
behavior, ownership, rendering performance, or the reviewer-requested component contract.

## Required invariants

- `MessageList` receives a module-level, referentially stable `renderAssistantMessage` function.
- Chat composes its toolbar through the exported `AssistantMessage` `children` slot.
- Copy state and regenerate availability remain in separate state and command contexts owned by the
  chat workspace.
- Topic changes, pending async work, feedback expiry, failure alerts, accessibility labels, and
  preview-mode toolbar disabling keep their current behavior and regression coverage.

## Design

### Production code

Inline the JSX from the single-use `ChatAssistantMessage` component into the existing module-level
`renderChatAssistantMessage` function in `ChatWorkspace.tsx`. Delete the wrapper file. This keeps
the renderer stable while removing a component that has no state, context consumption, memoization,
or independent contract.

Do not merge `AssistantMessageToolbar` with `AssistantMessageActionsProvider`, change either context,
or alter the async lifecycle guards.

### Tests

Keep every existing behavioral scenario. Reduce repeated setup in the provider test with local,
test-only helpers for mounting the provider, invoking copy, and flushing resolved promises. Keep the
helpers specific to this test file; do not create a shared testing abstraction.

Toolbar tests retain their current pending, copy, busy, regenerate wiring, and accessibility
coverage. Tests may be made more concise only when their arrange/action/assert sequence remains
obvious.

## Verification

- Run formatting and lint checks on changed files.
- Run the seven focused message-toolbar suites.
- Run the complete repository type check.
- Confirm the final branch diff contains no `ChatAssistantMessage` reference and preserves all test
  scenarios.

## Non-goals

- No public API, translation, visual, or runtime behavior changes.
- No new generic hooks, test utilities, or speculative reusable components.
- No history rewriting or force-push.
