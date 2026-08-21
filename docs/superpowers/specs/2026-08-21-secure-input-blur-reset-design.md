# SecureInput blur display reset

## Goal

Make a single-line `SecureInput` display the beginning of a long secret after it loses focus on both iOS and Android. The rule applies regardless of whether the secret is currently masked or revealed.

## Scope

- Keep the change in the shared `SecureInput` component.
- Preserve caller-owned values and existing `onBlur` behavior.
- Preserve the existing visibility button, accessibility labels, and focus behavior.
- Do not change input values, persistence, or provider-specific forms.

## Design

`SecureInput` wraps a native single-line `TextInput` but currently forwards the caller's blur handler unchanged. On Android, the native control preserves its previous horizontal scroll offset after blur, while iOS may redraw from the start. The wrapper will compose a blur handler that:

1. forwards the native blur event to the caller;
2. resets the native text selection to offset `0`; and
3. leaves focus management and the controlled value unchanged.

The native selection reset is the smallest cross-platform control exposed by React Native for moving the single-line display anchor. It makes the blurred rendering deterministic without a platform-specific implementation or remounting the input.

## Alternatives considered

- **Android-only reset:** fixes the observed platform but leaves the shared behavior divergent and encodes an incidental native difference in the API.
- **Remount on blur:** forces a fresh layout but risks losing accessibility/focus state and creates avoidable controlled-input churn.

## Regression coverage

Add a focused component test that simulates a blur and asserts that the wrapped native input receives a selection reset to `{ start: 0, end: 0 }`, while the supplied `onBlur` callback still receives the original event. Existing tests remain responsible for generic input forwarding.

## Validation

Run the focused regression test, format and lint the changed files, type-check the app, and manually verify a long masked API key on Android. The behavior is shared, so iOS validation is required before review when an iOS simulator is available.
