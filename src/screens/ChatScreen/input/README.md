# Chat Input Behavior

This directory owns the floating chat input shown at the bottom of chat workspaces.
`ChatInput` stays prop-less and is exported through `index.ts`; callers should not reach into the
internal provider or leaf components.

## Current Behavior Contract

- The input starts with the localized `chat.inputPlaceholder` placeholder and an empty local draft.
- Focusing the text area marks the input as focused and animates the Add button and text surface from
  the merged resting state into separated controls.
- Blurring the text area clears the focused state. If no tool is selected, the controls animate back
  into the merged resting state.
- Pressing Add blurs the text area, dismisses the keyboard, clears the focused state, and opens the
  bottom action sheet.
- The action sheet uses fixed snap points of `50%` and `70%`, supports pan-down close, and renders:
  camera, photos when photo access is not `all`, photo previews, a divider, and the tool action list.
- Photo permissions and previews load only while the sheet is open. Failures are treated as no photo
  access, with previews and selected photos cleared.
- Selecting a preview toggles its selected state. Selected preview badges show one-based selection
  order in the order selected.
- Closing the action sheet clears selected photos.
- Selecting a tool clears selected photos, toggles that tool, closes the sheet, and refocuses the
  text area after the native sheet close delay.
- The selected tool tag appears above the text area using the tool's localized short title and can be
  cleared without opening the sheet.
- The floating selected-photo action is visible only when at least one photo is selected. Its press
  handler is currently a no-op.

## Ownership

- `ChatInputProvider` owns draft text, focus state, sheet open state, selected tool state, selected
  input assets, and the text input ref.
- `useChatInputPhotoPicker` owns platform photo permissions, photo preview loading, and selected
  photo ids.
- Leaf components render controls from provider state and call provider actions. They should not
  introduce parallel state for the same behavior.
- Future selected image/file display should extend the selected input assets shape rather than adding
  independent attachment state to toolbar, sheet, or text area components.

## Manual Acceptance With agent-device

Use the existing Expo dev server on port `8001`.

1. Open the installed dev client:

   ```bash
   agent-device open com.cherry-ai.cherry-studio-app --session chat-input --platform ios --device "iPhone 17 Pro" --relaunch
   ```

2. Verify `Message` or `输入消息` is visible.
3. Fill the message input and verify the draft remains visible.
4. Press Add and verify the bottom sheet shows Camera/Photos and the tool actions.
5. Press each tool action and verify the sheet closes, the selected tool tag appears, and the input
   is focusable again.
6. Press the clear control in the selected tool tag and verify the tag disappears.
7. Open and close the sheet again and verify the input remains usable.
8. If photo permission UI appears, handle the visible permission controls and verify the media strip
   matches the granted state.
