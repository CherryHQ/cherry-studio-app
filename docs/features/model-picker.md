# Model Picker

Bottom-sheet model selector shared across chat and settings for searching models, filtering by
capability, scrubbing providers via the fast scroller, toggling multi-model reply selection, and
persisting the chosen model per conversation.

## User Entry

- Open from the chat header / composer model pill (clear multi-reply selection via
  `testID:composer-reply-models-clear`).
- Drawer root: `testID:model-picker`.
- Key controls inside the drawer:
  - Search input: `testID:model-picker-search`
  - Capability filter menu: `testID:model-picker-filter`
  - Multi-select toggle: `testID:model-picker-multi-select`
  - Model list: `testID:model-picker-list`
  - Provider fast scroller: `testID:model-picker-fast-scroller`, rail `testID:model-picker-provider-scroll`,
    and floating preview bubble `testID:model-picker-provider-preview`.

## Verification Driver

- `agent-device` workflow: open `testID:model-picker`, search via `testID:model-picker-search`,
  toggle capability filter via `testID:model-picker-filter`, select a model, and verify chat header
  updates and persists after switching conversations and relaunching.
- Unit/hook suites under `src/frontend/components/ModelPicker/` and conversation model persistence
  tests.

## Observable Acceptance

- Typing in `testID:model-picker-search` narrows `testID:model-picker-list` smoothly without dropping
  keystrokes or jumping scroll position.
- Dragging along `testID:model-picker-provider-scroll` continuously updates
  `testID:model-picker-provider-preview` to the hovered provider.
- Selecting a model updates the active conversation's model and survives navigating away and back.

## Known Pitfalls

- Fast-scroller drag gestures compete with vertical list scrolling and bottom-sheet pan gestures;
  verify dragging without accidentally dismissing the sheet.
- Multi-model reply cards require `testID:model-picker-multi-select` and are gated by provider
  availability; empty provider lists show an empty state rather than stale cached models.
