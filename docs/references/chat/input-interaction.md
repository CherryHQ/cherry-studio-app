# Chat Input Interaction

> Status: scoped interaction contract; native acceptance pending

Keep the existing composer design and motion: the one-row/two-row transition, text growth,
toolbar reveal, add menu, and reasoning panel animations belong to their current components.
A keyboard-stability fix preserves these visuals and changes only the conflicting event path.

## Keyboard And Selection Rules

- Send submits the draft. The chat's existing `dismissKeyboardOnSend={false}` also applies to
  list scrolling after submission; the list must not issue a second keyboard-dismiss command.
- Scrolling, selecting text, copying, and pressing message actions perform their own operation.
  A parent `onTouchEnd` must not turn all of them into an input-dismiss action. Keep native scroll
  tap handling separate from drag dismissal.
- Keyboard show/hide notifications describe native state. They do not establish that the user
  ended editing and must not trigger an additional composer blur or layout transition.
- Plugin insertion uses the editor's retained insertion position. It does not request text focus;
  an already closed keyboard must not be reopened by an application `focus()` call.
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
| Open/close add or reasoning controls | Existing control and animation; no new global keyboard policy |
| Choose a plugin | Insert once or retain the existing reference; no forced text focus |
| Select a model or choose media/files | Existing picker and input-transfer path |
| Send or stop | Existing submission/cancellation flow; local-send scrolling does not dismiss input |
| Admission/import failure or approval arrival | Existing recovery, attachment, and approval workflow |
| Scroll or use message content | Message/list owner; no blanket parent touch dismissal |
| Navigate to another context | Existing navigation and draft ownership |

Draft recovery, attachment failure presentation, approval prompts, model persistence, reasoning
value policy, and navigation-wide draft storage retain their existing behavior. They require their
own scoped changes if an observed problem warrants one.

## Acceptance

Source changes remove the identified application commands; they do not establish native keyboard
or selection conformance. With explicit device-verification authorization, check on iOS and Android:

- Original composer and tool animations remain visible, including reduced-motion behavior.
- With the keyboard open and then closed, select text, drag both handles, Select All, Copy, and
  dismiss the editing menu. The selected range may change; the outer composer and keyboard state
  remain stable without a brief hide/show cycle.
- Send, scroll, and use message actions without unintended keyboard dismissal.
- Insert or reselect a plugin without reopening a closed keyboard.
- Open/cancel model and media pickers and continue editing through their existing handoff.

See the [Chat Input README](../../../src/frontend/features/chat/components/ChatInput/README.md),
[shared Composer README](../../../src/frontend/components/Composer/README.md), and
[Interaction And Gesture Arbitration](../interaction-and-gesture-arbitration.md) for ownership.
