# Unified Input Password Design

## Goal

Replace the separate public `SecureInput` component with a password variant of the shared `Input`
component. Consumers will select the behavior with `type="password"`; CherryUI will continue to own
password masking, the visibility action, focus behavior, and composed field layout.

## Public API

`Input` will expose two discriminated variants:

```tsx
<Input
  accessibilityLabel="API key"
  onChangeText={setApiKey}
  type="password"
  value={apiKey}
  visibilityAccessibilityLabels={{
    hide: "Hide API key",
    show: "Show API key",
  }}
/>
```

- `type` defaults to `"text"` so existing plain and multiline `Input` consumers remain unchanged.
- `type="password"` requires `visibilityAccessibilityLabels`. CherryUI will not own translated
  product copy.
- `blurOnVisibilityToggle` is available only for the password variant.
- The password variant owns `autoCapitalize`, `autoCorrect`, `multiline`, `secureTextEntry`, and
  `selection`; callers cannot provide conflicting values.
- Raw `secureTextEntry` is removed from the public `Input` contract. Callers use
  `type="password"` for the complete supported interaction.
- `style` keeps its existing target: the native field in text mode and the composed outer field in
  password mode.
- The forwarded ref resolves to the native `TextInput` in both variants.

The password label type will be exported as
`InputPasswordVisibilityAccessibilityLabels`. `SecureInput`, `SecureInputProps`, and
`SecureInputVisibilityAccessibilityLabels` will be removed without compatibility aliases.

## Internal Structure

The public component remains owned by `packages/ui/src/components/input`. Its type definition will
use a discriminated union so TypeScript rejects password-only props on text inputs and rejects
native props whose behavior the password variant owns.

The existing password composition will become private implementation inside `input.tsx`. A private
native-field leaf will render HeroUI for both variants, and a private password-field leaf in the
same file will own the composed frame, visibility state, and trailing action. There will be one
public component, one public module, and one behavior contract. The separate `secure-input` module
and public barrel export will be deleted.

This keeps the repository's current consumer-driven shared-component pattern: feature code owns
the controlled value and localized labels, while CherryUI owns reusable interaction and layout.
It also avoids a generic trailing-action API, which would broaden `Input` for a single known use
case and push visibility state back to consumers.

## Password Behavior

The password variant preserves the current `SecureInput` behavior:

- Visibility starts hidden on every mount.
- The trailing visibility button toggles masking and animates between hidden and visible icons.
- Toggling retains input focus by default. `blurOnVisibilityToggle` intentionally blurs first for
  consumers that commit drafts or dismiss the keyboard on blur.
- Blurred content is positioned at the start; focus releases selection control to the native input,
  including `selectTextOnFocus` behavior.
- Long native text is clipped before the visibility action, which keeps the action reachable.
- The composed field matches the height and visual treatment of a plain `Input`.
- Disabled and invalid state can come directly from props or from the surrounding `TextField`.
- Disabling the field also disables the visibility action.
- The password field is single-line, does not auto-capitalize, and does not auto-correct.

No new visual design is introduced. The existing password layout, icons, motion, light/dark theme
behavior, and accessibility semantics are retained under the unified API.

## Consumer Migration

All repository consumers will migrate atomically:

- Provider creation API-key field.
- Provider API-service API-key editor.
- Web-search API-service API-key editor.

Each use will replace `SecureInput` with `Input type="password"`. Helper prop types will replace
`SecureInputVisibilityAccessibilityLabels` with
`InputPasswordVisibilityAccessibilityLabels`. Existing controlled values, normalization, commit
events, translated labels, and blur behavior remain unchanged.

The standalone `SecureInput` Storybook story will be deleted. Password states will move into the
existing `Input` story so text, disabled, multiline, and password behavior are inspected together
in light and dark themes.

## Testing

Implementation will follow a red-green-refactor loop:

1. Add `Input type="password"` tests before changing production code and confirm they fail because
   the unified variant does not exist.
2. Cover observable password contracts: initial masking and label, visibility toggling, disabled
   action state, focus/blur selection ownership, clipping before the action, and forwarded ref.
3. Implement the smallest unified behavior that makes the tests pass.
4. Migrate consumers and remove `SecureInput` only after the unified tests pass.
5. Run the focused `Input` component suite, file-scoped formatting and linting, repository
   typecheck, and the final local gates required by the repository guide.

Tests will assert rendered interaction and public behavior rather than private helper calls or
snapshots.

## Scope Boundaries

This change does not add generic input adornments, configurable visibility icons, default English
accessibility labels, uncontrolled value state, new password-strength behavior, or a deprecated
compatibility export. It does not alter feature persistence or API-key normalization and commit
semantics.
