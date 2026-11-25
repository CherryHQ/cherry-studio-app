# Chat Input Interaction

> Status: scoped interaction contract; native acceptance pending

Keep the existing composer design and motion: the one-row/two-row transition, text growth,
toolbar reveal, add menu, and reasoning panel animations belong to their current components.
A keyboard-stability fix preserves these visuals and changes only the conflicting event path.

## Keyboard And Selection Rules

- Send submits the draft, explicitly blurs the input, ends composer editing, and dismisses the
  keyboard through its native transition. The dock follows the keyboard's actual position on both
  opening and closing; the composer's collapse uses the same motion as expansion. List
  scrolling after submission must not issue a second keyboard-dismiss command.
- Scrolling, selecting text, copying, and pressing message actions perform their own operation.
  A parent `onTouchEnd` must not turn all of them into an input-dismiss action. A completed,
  unhandled tap on the chat background explicitly blurs the input and ends composer editing.
  The list lets that press reach the background owner; scrolling can cancel the press.
- The ordinary chat field expands when its own software keyboard starts opening and returns to
  one row when it starts closing, including with an unsent draft or attachments. The dock
  follows the close to its final frame. Hardware focus and keyboards belonging to a sheet leave
  the chat field compact. Keyboard notifications never issue a second blur.
- The local tools sheet waits for keyboard dismissal. Selecting a plugin inserts its reference
  at the editor's retained position. The keyboard of a sheet belongs to that sheet.
- Long press, selection-handle dragging, Select All, Copy, and editing-menu dismissal preserve the
  composer's current presentation and keyboard state. Raw touches on a popover's composer anchor
  must not close the panel while the editor is interpreting that sequence.
- Explicit model, file, camera, and photo selection keep the existing input-transfer behavior.
  Their presentation, draft semantics, and animations are not redesigned by this patch.

## Operation Boundaries

| Operation | Owner and expected effect |
| --- | --- |
| Tap to edit, type, delete, paste, undo, or move the caret | Native editor; retain existing content growth and composer motion |
| Select content, drag handles, copy, or dismiss the editing menu | Native selection; no added focus, blur, panel close, or outer layout change |
| Tap chat background outside the composer | Blur the editor and end editing through the existing composer transition |
| Open/close add or reasoning controls | Existing control and animation; no new global keyboard policy |
| Choose a plugin | Insert once or retain the existing reference; no forced text focus |
| Select a model or choose media/files | Existing picker and input-transfer path |
| Send | Submit the draft, blur the input, end editing, and dismiss the keyboard; local-send scrolling does not dismiss input again |
| Stop | Existing cancellation flow; preserve the input's focus and keyboard state |
| Admission/import failure or approval arrival | Existing recovery, attachment, and approval workflow |
| Scroll or use message content | Message/list owner; no blanket parent touch dismissal |
| Navigate to another context | Existing navigation and draft ownership |

Draft recovery, attachment failure presentation, approval prompts, model persistence, reasoning
value policy, and navigation-wide draft storage retain their existing behavior. They require their
own scoped changes if an observed problem warrants one.

## Implementation Boundaries

`ComposerDismissArea` delegates tap recognition to CherryUI's native `BackgroundPressArea`.
Android uses `GestureDetector`; iOS uses UIKit recognizers with pan priority, installed on the
Fabric component host because React children are mounted beside the Nitro content view. Neither
uses a JavaScript responder around the list or infers a tap from the touch's final coordinates.
The native view alone decides whether a touch is a background press. Scrolling, a touch that
stops momentum, extra pointers, nested areas and exclusions cancel it on the UI thread; JavaScript
receives only completed presses, so batched React Native touch or scroll events cannot race it.

Message text stays a background target, so tapping it dismisses the composer. Controls with their
own taps are exclusions: message-part disclosures and cards, sources, file strips, the assistant
toolbar, painting results and retry actions, and the scroll-to-bottom control. Content presented
in sheets is outside the area. `ScrollInteractionBoundary` owns drag/momentum state for context
menus and has no background-press policy.

The composer presentation hook issues at most one blur per editing session. The Android keyboard
adapter patch also clamps an invalid scroll offset when the closing animation ends, including
when its last move event did not contain the final height. Valid reading positions and legitimate
bottom padding remain intact. These changes do not establish a cause for unexpected drawer opens;
the existing drawer interaction needs separate native acceptance.

## Acceptance

Source changes remove the identified application commands; they do not establish native keyboard
or selection conformance. With explicit device-verification authorization, check on iOS and Android:

- Original composer and tool animations remain visible, including reduced-motion behavior.
- With the keyboard open and then closed, select text, drag both handles, Select All, Copy, and
  dismiss the editing menu. The selected range may change; the outer composer and keyboard state
  remain stable without a brief hide/show cycle.
- Send a message to blur the input, end editing, and dismiss the keyboard. Scrolling and message
  actions do not issue additional keyboard-dismiss commands.
- With a three-line unsent draft, close the keyboard and tap the field again before the close
  finishes. The frame reverses from its current height, the original field retains the draft and
  selection, and the model controls become available with the keyboard. Repeat with staged
  attachments, a hardware keyboard, and a picker search field.
- Tap the empty chat, the unused message-list area, or message text to blur the input and dismiss
  its keyboard. Tapping a message control performs only that control's action.
  The composer returns to one row with its existing draft; dragging or child actions do not
  count as background presses.
- Drag away and back to the starting point, hold without moving, use multiple fingers, and tap
  to stop momentum. None dismiss the composer. A subsequent background tap does.
- In short and long conversations, close the keyboard while following the latest message and
  while reading history. No stale keyboard-sized gap remains; valid reading positions stay put.
- Repeat vertical and diagonal scrolling with the keyboard open and closed. Confirm scrolling
  remains responsive, intentional horizontal drawer swipes work, and vertical scrolling does not
  open the drawer. Check horizontal code/table scrolling and Android system back separately.
- Open the local tools sheet from an active chat field. Its keyboard closes and the chat field
  compacts. Open a picker search field and dismiss it. Only the picker's keyboard should move.
- Open/cancel model and media pickers and continue editing through their existing handoff.

See the [Chat Input README](../../../src/frontend/features/chat/components/ChatInput/README.md),
[shared Composer README](../../../src/frontend/components/Composer/README.md), and
[Interaction And Gesture Arbitration](../interaction-and-gesture-arbitration.md) for ownership.

The context usage ring stays on the right of the composer at rest and while editing, beside the
primary action. It opens a compact anchored progress popover without dismissing the keyboard or
changing the draft. The popover shows the measured percentage and total capacity in `k token`;
outside taps and system back dismiss it. Dictation and send/stop actions remain available.
Occupancy follows the selected branch's effective runtime context, including the retained answer,
tool results and compaction summary. Committed compaction refreshes the ring and any open popover
without another send. Without a Pi working copy, saved rebuild context supplies an estimate marked
with `≈`; opening the composer does not create a copy or call a model. Old input counts or cumulative
billing totals are never displayed directly as occupancy.
