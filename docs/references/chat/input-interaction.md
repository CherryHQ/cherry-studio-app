# Chat Input Interaction

> Status: partially implemented; native acceptance pending
>
> September 2026 implementation adds the fixed composer structure, explicit picker lifecycles,
> keyboard-preserving send/list actions, selection-safe application callbacks, isolated failure
> recovery, failed attachment tiles, stable model search, explicit effort reset, and opt-in approval
> details. The operation matrix remains the target; it is not a claim of complete conformance.
>
> Remaining work includes navigation-wide draft retention and fresh same-Agent New Chat identity,
> recognized blank-area dismissal, complete cross-surface Back/Escape and focus arbitration, and
> native selection/insertion acceptance on iOS/Android. Lightweight panels currently stay open
> during editor touches, including an ordinary typing tap, to avoid treating selection as dismissal.
> Tests, compilation, and application/device acceptance have not been run for this implementation.

This contract covers the chat composer, its tools and attachments, and surrounding actions that
can affect it. Shared Composer changes also affect painting; painting must adopt the shared
keyboard contract deliberately without inheriting chat-only controls or layout.

The [current Chat Input README](../../../src/frontend/features/chat/components/ChatInput/README.md)
and [shared Composer README](../../../src/frontend/components/Composer/README.md) remain as-built
references. [UI Components](../ui-components.md) owns reusable components;
[Navigation And Insets](../navigation-and-insets.md) owns navigation and system geometry;
[Interaction And Gesture Arbitration](../interaction-and-gesture-arbitration.md) owns touch
cancellation; [Design Spec](../../../DESIGN.md) owns visual and motion decisions.

## Core Rules

1. An operation changes only what its name promises. Send submits content; stop cancels a turn;
   selecting a model changes the model. None of these implicitly ends editing.
2. Preserve the existing keyboard state for ordinary composer operations. Preserve means no
   `focus`, `blur`, keyboard dismissal, or delayed focus restoration. A closed keyboard stays closed.
3. Only an explicit dismissal, an explicit transfer to another input surface, or committed
   navigation may request that the composer relinquish text focus. The operation matrix below is
   the allowlist. A native keyboard event is an observation, not evidence of user intent.
4. Keep draft content, native editing, open surfaces, submission state, and geometry independent.
   An empty draft, hidden keyboard, native blur, or completed request is not a collapse command.
5. One touch sequence produces one semantic action. Closing a backdrop cannot also activate a
   message action or dismiss the keyboard behind it. A drag cannot become an outside tap.
6. Each delayed completion belongs to the composer and operation that started it. Later user
   actions and navigation take precedence over old callbacks.
7. Validation may prevent an invalid action and explain why. It must not silently rewrite the
   draft, select a different model, move the caret, close an unrelated panel, or change text focus.
8. Selecting content in the composer preserves its presentation and soft-keyboard state. Starting,
   extending, copying, or dismissing a selection is not a request to enter or leave typing mode.
   This is an explicit user requirement, independent of the fixed layout.

## Layout And Entry Points

- Use a stable structure: optional attachment row, full-width text area, then one action row.
  Empty, focused, blurred, sending, and stopped states use the same structure. Remove automatic
  one-row/two-row morphing and the editing flag used to drive it.
- Keep the existing action roles: **add**, **model**, **reasoning effort**, **send/stop**.
  Add contains camera, photos, files, and connected plugins. Do not add a new top-level control
  for every attachment source or plugin. Reasoning effort is available only for supporting models;
  its slot must not displace send/stop when availability changes.
- Stable structure does not mean fixed height. Text grows to its documented cap and then scrolls;
  adding/removing attachments changes the attachment row. Keyboard and safe-area geometry may
  move the dock. Focus, panel visibility, network timing, and empty/nonempty transitions must not
  independently rearrange the controls.
- Opening plugins, add, or reasoning controls must not compress the text area, hide attachments,
  remount the editor, or move the source control to make space. Position and scroll the panel within
  the available viewport. Reuse the component owner's responsive layout and motion rules.
- Touch targets and their visible positions must agree throughout transitions. Background
  rendering must not move a control under a committed press. An outgoing panel becomes inert
  immediately; any exit animation is presentation only.

## Keyboard Policies

| Policy | Meaning | Used by |
| --- | --- | --- |
| Preserve | Keep native text focus and keyboard as they are; never call focus to enforce preservation | Typing adjuncts, add/plugin/effort overlays, send/stop, attachment removal, message utilities |
| Edit | The user explicitly activates a text field; that field becomes the text-input owner | Tapping the composer or a picker's search field; explicit restore-and-edit action |
| Dismiss | Relinquish composer focus once without changing its content or structure | A recognized outside blank-area tap or an explicit keyboard-hide action |
| Transfer | Suspend composer input before presenting an independent surface; its own inputs own any keyboard | Model sheet, library picker, native media/document picker, explicit approval detail, file viewer, navigation |

Transfer has one return rule: success, cancellation, permission denial, and presentation failure
all return without requesting composer focus or reopening its keyboard. Apply successful data
changes only to the originating draft. Keep that draft and its selection available for the next
explicit edit. If the operating system restores a native responder on its own, observe the real
owner; do not start a corrective hide/show loop.

An in-app panel is not automatically a Transfer merely because it uses a modal implementation.
Its declared product role determines the policy. Add, plugins, and effort are Preserve surfaces;
the current full model and library selectors are Transfer surfaces. Replacing their presentation
must preserve their declared semantics or explicitly update this contract.

## Operation Matrix

Every row inherits the core rules and the return rule above. A disabled action has no side effects.

### Text And Direct Editing

| Operation | Required result | Keyboard policy |
| --- | --- | --- |
| Open an existing chat or a new draft | Show that context's draft and the stable action row; no autofocus | No focus request |
| Tap the text area to begin typing | Place the caret through native editing; close an open lightweight panel without consuming the edit tap; selection/menu handling takes precedence over this rule | Edit |
| Type, delete, cut, paste text, undo, redo, or move selection | Apply only the native text operation; preserve unrelated attachments and choices | Preserve |
| Chinese/Japanese composition, dictation, or candidate selection supplied by the keyboard | Let the native editor own marked text and selection; do not round-trip each update through `setValue` | Preserve |
| Press Return in the multiline field | Insert a newline; candidate confirmation is not send | Preserve |
| Paste one or more images | Add attachment imports in order; keep text and selection intact | Preserve |
| Scroll long input, drag selection handles, or open the native editing menu | Only perform the selected native interaction; ancestor handlers remain inert | Preserve |
| Delete the final character or final plugin reference | Update text only; do not collapse or hide tools | Preserve |

No new hardware-keyboard send shortcut is introduced by this design. Any later shortcut needs an
explicit key contract and must not submit uncommitted input-method text.

### Selecting Content In The Composer

The complete selection interaction preserves the input state that exists when selection begins.
An open soft keyboard stays open; a closed one stays closed. The composer retains its presentation,
outer frame, toolbar, attachments, and native editor identity. Only the selected range, selection
handles, magnifier, editing menu, and native internal scrolling needed to reach text may change.
This rule applies to selecting draft content, separately from selecting text in a message bubble.

| Selection operation | Required result |
| --- | --- |
| Long-press or use a native multi-tap selection gesture | Select content without expanding/collapsing the composer or opening/hiding the keyboard; do not first treat touch-down as an edit tap |
| Drag either selection handle, including across lines or outside the editor's visible bounds | Change the selected range; allow native internal auto-scroll; do not trigger parent scrolling, outside dismissal, tool activation, or outer-frame resizing |
| Select All | Change the selected range only, including with the keyboard closed |
| Open, navigate, or dismiss the native editing menu | Change only the menu; presenting it is not an input-replacement operation |
| Copy the selection | Copy only the selected content; any native menu dismissal does not change the composer or keyboard |
| Tap to collapse a selection or dismiss its menu | Perform only that selection/menu action; the same tap cannot also activate typing or dismiss the keyboard through an ancestor |
| End, cancel, or interrupt a selection gesture | Retain the current input/keyboard state; do not run delayed blur, refocus, collapse, or restoration |
| Choose Cut, Paste, or Delete | Apply that explicit content change; natural content height may change, but no keyboard transition or layout-mode change is implied |

The preservation requirement concerns the observable result, not merely the absence of an
application `Keyboard.dismiss()` call. Selection-related native focus/menu callbacks must not be
reinterpreted as `activateInput`, `dismissInput`, or a dock reset. If a native editor couples
selection to showing the keyboard, its input adapter must support the required separation; a
show-then-hide workaround, refocus loop, disabled editing, or removal of text selection is not
conformance. Native selection remains owned by the editor, not recreated in feature code.

A later explicit typing action, system keyboard-hide action, content mutation, or committed
navigation may have its own documented effect. Selection cleanup must not restore an older state
over that newer action. A keyboard transition already initiated before selection may finish;
selection must not initiate, reverse, or restart it. Unrelated environment changes follow their
own geometry rules rather than forcing the UI back to a captured frame.

### Add Menu And Plugins

| Operation | Required result | Keyboard policy |
| --- | --- | --- |
| Tap add | Open the menu once at its stable anchor | Preserve |
| Tap add again, its backdrop, or its close action | Close only the menu; backdrop taps do not pass through | Preserve |
| Scroll the add menu | Scroll without selecting an item or dismissing input | Preserve |
| Choose Plugins | Replace the add menu with the plugin panel; keep text and attachments visible | Preserve |
| Scroll or cancel the plugin panel | Scroll or close only that panel | Preserve |
| Choose a plugin | Insert one reference at the editor's retained insertion position, followed by a space; close the panel | Preserve |
| Choose an already referenced plugin | Close without inserting a duplicate or moving the caret | Preserve |
| Delete a plugin reference in the field | Remove only that reference using native editing | Preserve |
| Plugin connection/catalog data changes while the panel is open | Update availability in place; keep the panel or show its empty/error state, without rewriting existing references | Preserve |
| Choose an unavailable plugin | Explain unavailability; do not insert or redirect to authorization automatically | Preserve |

Plugin insertion must not use unconditional `focus()`. Native insertion must retain the selection
without requiring a hidden keyboard to reopen. If that cannot be supported by the editor, treat
it as an implementation constraint to resolve, not permission to silently change the interaction.
Accessibility focus may move into the panel and back to its trigger; it is not text-input focus.

### Model And Reasoning Effort

| Operation | Required result | Keyboard policy |
| --- | --- | --- |
| Open model selection | Open one independent selector; keep the composer mounted and its draft intact | Transfer |
| Tap model search | Edit only the search field; its keyboard must not move the suspended composer | Edit in selector |
| Type, clear, or scroll search results | Change search/results only; retain the selector's established size for this opening | Selector owns input |
| Choose the current model | Close with no mutation | Transfer return |
| Choose another model | Show the selected model immediately; submit with that visible choice; close the selector | Transfer return |
| Cancel, swipe-close, or leave model selection | Keep the previous model if no selection was made | Transfer return |
| Add a provider from the selector | Follow the explicit setup route and preserve the originating draft; returning does not autofocus it | Transfer/navigation |
| Model persistence fails | Explain the failure and any rollback visibly; an older failed pick cannot roll back a newer choice | Preserve |
| Model list/configuration refreshes | Do not silently substitute a valid user selection; mark an unavailable choice and explain the next action | Preserve |
| Open reasoning effort | Open a lightweight control with the current value visible | Preserve |
| Tap a reasoning stop or finish a slider drag | Commit that user-selected value; a cancelled drag restores its starting value | Preserve |
| Close reasoning effort | Close the panel; retain values already committed by a completed gesture | Preserve |
| Switch to a model with different reasoning options | Keep a supported selection; otherwise show the model default and disclose the reset; never silently project to a different numeric level | Preserve after selection |

Model selection retains its existing Agent-default persistence scope. The selector must make
that scope understandable; each send captures the displayed model. Reasoning effort remains a
local composer preference for subsequent sends, not an Agent configuration mutation. Provider
default, automatic mode, and explicit levels remain distinguishable. Neither choice modifies an
already submitted turn. Search blur, clearing text, and keyboard height are not sheet-resize commands.

### Attachments And External Surfaces

| Operation | Required result | Keyboard policy |
| --- | --- | --- |
| Choose Camera or Photos | Close add, transfer once, then request permission/present the picker | Transfer |
| Complete media selection | Stage selected files once, in order, in the originating draft | Transfer return |
| Cancel media selection or deny permission | Preserve the draft; explain denial if relevant without reopening a menu | Transfer return |
| Picker fails to open | Show actionable failure feedback; release presentation ownership | Transfer return |
| Choose Files | Open the library picker with a fresh pending selection; already attached files stay identified | Transfer |
| Select/unselect a library row, including its thumbnail | Change only pending selection; do not preview the file or mutate draft attachments yet | Selector owns input |
| Scroll, paginate, or retry the library list | Update the list without resetting pending selection | Selector owns input |
| Confirm Add | Append selected available entries once; close the picker | Transfer return |
| Cancel the library picker | Discard only its uncommitted selection | Transfer return |
| Choose Upload Files | Discard uncommitted library selection, close the library surface, then open the native document picker | Same Transfer operation |
| Complete/cancel/fail the document picker | Add selected files once, or keep the draft unchanged on cancellation; explain failure | Transfer return |
| Import progress or successful completion | Update the existing attachment tile in place; enable send only when all attachments are ready | Preserve |
| Import failure | Keep a visible failed tile with remove/retry guidance; do not silently send a message missing that attachment | Preserve |
| Remove a pending, failed, or ready attachment | Remove that draft reference only; a late import cannot restore the removed tile | Preserve |
| Scroll the attachment row | Scroll only; no preview/removal/dismissal from the same drag | Preserve |
| Tap a ready attachment preview | Open its viewer or system destination with draft/selection retained | Transfer |
| Return from preview or system sharing/opening | Keep the same draft and attachment order | Transfer return |

Imported library files remain library-owned after attachment removal, failed sending, or navigation.
Removing a pending reference invalidates its completion for this draft; it does not promise that
underlying file I/O was cancelled. A late result after context departure cannot attach to a new chat.
If retry requires access that has expired, provide an explicit reselect action.

### Sending, Stopping, Failure, And Approval

| Operation/event | Required result | Keyboard policy |
| --- | --- | --- |
| Tap disabled Send, or send with empty/unready content | Do nothing; show the reason for unavailable sending without clearing content | Preserve |
| Send valid content | Capture one text/attachment/model/effort snapshot, show local pending feedback, and clear exactly that submitted draft | Preserve |
| Tap Send repeatedly before admission | Admit at most one submission of that snapshot | Preserve |
| Continue typing while admission or generation runs | Edit the next local draft; do not silently queue or steer a turn | Preserve |
| Admission succeeds or first send creates a Session | Preserve composer/native editor identity through the Draft-to-Session handoff | Preserve |
| Admission fails and the cleared draft has not been edited | Restore the submitted draft once, with feedback; do not move focus | Preserve |
| Admission fails after the user has edited the next draft | Keep the newer draft untouched and retain the failed submission as recoverable content; never automatically prepend/merge it | Preserve |
| Explicitly recover a failed submission | Make recovery reviewable; replacing a nonempty current draft requires an explicit replace/discard choice | Edit only if action promises editing |
| A reply streams, completes, fails, or is interrupted after admission | Update message/turn state only; do not restore an already admitted message into the composer | Preserve |
| Tap Stop | Cancel the active turn once; preserve the next draft and all its settings | Preserve |
| Stop is acknowledged or fails | Update stop availability/feedback; never turn that same press into Send | Preserve |
| Tool approval arrives | Show a pending approval affordance at the message; keep the tool blocked until an explicit response; do not auto-open a blocking sheet or disable draft editing | Preserve |
| Explicitly open approval details | Open the approval surface; it may suspend composer input | Transfer |
| Allow, deny, stop, or close approval details | Apply only the named action; closing alone leaves approval pending and never grants permission | Transfer return |

Use nonmodal feedback for ordinary admission/import failures. A backend rejection is not an
implicit request to open a focus-taking alert. Preserve full actionable error details through an
explicit detail action. Keep draft and attachment revisions so an edited-then-emptied draft is not
mistaken for the untouched post-send draft. Never restore stale data or feedback into another chat.

### Chat Content, Navigation, And Environment

| Operation/event | Required result | Keyboard policy |
| --- | --- | --- |
| Tap a genuine blank area outside input with no foreground panel | Recognize a completed tap and dismiss once; keep the draft and toolbar | Dismiss |
| Drag the message list, stop its momentum, select message text, copy, expand details, or return to latest | Perform only that operation; neither a parent touch handler nor list configuration may also dismiss input | Preserve |
| Tap a message link, source/detail sheet, file, or fork action that opens another context | Run that explicit destination; preserve the originating draft | Transfer on actual presentation/navigation |
| List follows a local send, receives messages, loads history, restores an anchor, or corrects its viewport | Change list geometry only; never request keyboard dismissal | Preserve |
| Open the navigation drawer or Agent selector | Suspend input for that surface; cancelling retains the existing context | Transfer |
| Select an already active draft's Agent | Keep that draft; selecting the same entry is not New Chat | Transfer return |
| Switch Session/Agent or open a fork | Use the selected context's isolated draft; never reuse another chat's text, files, or pending callbacks | Navigation |
| Explicitly start New Chat, including from a draft for the same Agent | Allocate a fresh draft identity; keep the previous draft recoverable separately | Navigation |
| Visit settings/provider setup/file preview and return | Retain the originating draft even if the screen was temporarily unmounted | Transfer return |
| Navigate to a different message within the same Session | Preserve composer identity and draft | Preserve unless actual route departure |
| User hides the keyboard through a system control | Accept the native result; do not collapse the composer or immediately refocus | Native dismissal |
| Android Back / Escape / accessibility escape | One event belongs to one layer: let a system picker/input method consume it first; otherwise close the top app surface, then input, then navigate on later events | Owning layer only |
| App backgrounds/foregrounds; permission dialog returns; hardware keyboard connects | Observe the native owner and geometry; no synthetic autofocus or content reset | No new focus command |
| Keyboard emits show/hide/frame events, including duplicates or out-of-order events | Update keyboard observations only; do not infer that editing ended or a picker completed | Observe only |
| Rotation, resizing, font-size, theme, or keyboard-language changes | Relayout around the same draft and native editor; preserve open lightweight panels and choices where presentable | Observe only |
| Temporary data loading/refetch/failure | Keep an existing composer mounted with its draft; show local status rather than replacing it with an empty session | Preserve |

Draft retention above is scoped to contexts visited during the current app run, including temporary
routes. Persistence across process termination needs a separate storage decision; this document
does not claim it exists. An explicit discard may delete a draft; a data refresh may not. If a
surface becomes impossible to present after an environment change, cancel its active gesture and
close only that surface, without editing content or issuing focus commands.

Ordinary message scrolling does not mean "hide keyboard" in this design. This deliberately replaces
the current `on-drag` / `interactive` list dismissal behavior. Blank-area tap, system keyboard hide,
and committed navigation remain explicit dismissal paths; do not invent gesture thresholds.

## Ownership And Implementation Constraints

| Owner | Owns | Must not own |
| --- | --- | --- |
| Composer session | Draft/attachment revisions, originating context, pending submission recovery | Global keyboard observations interpreted as user decisions |
| Native text adapter | Text, caret, selection and input-method composition; explicit edit commands | Per-keystroke full text replacement or business-driven autofocus |
| Composer presentation owner | One current surface, operation identity, explicit transfer and completion/cancellation | An indefinite "input replaced" flag with no completion boundary |
| CherryUI surface/platform adapter | Surface lifecycle, input ownership adaptation, hit areas and accessibility focus | Business rules inferred from keyboard visibility or frame timing |
| Dock | Keyboard/safe-area geometry for the actual input owner | Draft, panel, or send-state changes |
| Message list | Scroll position and anchoring within the current viewport | `focus`, `blur`, or keyboard dismissal |
| Chat feature and navigation | Model/effort scope, send/stop/approval actions, draft identity handoffs | Resetting the draft on a cache refresh or late completion |

Maintain one active composer surface rather than unrelated model/file/plugin/effort open flags.
Opening a new surface ends the preceding one once; outgoing callbacks cannot close or focus the new
one. A native system picker owns the interaction until it returns; do not launch a competing picker.
Resolve ownership through actual presentation/close/cancel events, including failed presentation
and unmount. A frame delay may sequence native UI work, but cannot prove ownership or readiness.

Keep text focus and accessibility focus separate. Panel accessibility focus must return to its
still-current trigger without invoking editor `focus()`. Do not attach new keyboard repair
effects to `isBusy`, draft length, attachment count, model query results, or animation completion.
Retain native editor identity across ordinary render, send, panel, and first-session transitions.

## Acceptance Scenarios

These are future acceptance requirements, not executed checks. Run device/application verification
only when authorized. On iOS and Android cover keyboard initially open and closed, empty and
nonempty drafts, attachments, long text, and increased font size.

| Sequence | Observable requirement |
| --- | --- |
| With keyboard open, long-press draft text; drag both handles; Select All; Copy; dismiss the menu | Keyboard stays open and composer frame/tools/attachments remain unchanged throughout |
| Repeat the complete selection sequence with keyboard closed | Keyboard remains closed throughout, with no brief show/hide cycle |
| Select across many lines; drag a handle beyond the text area's bounds | Only native internal scrolling and selection change; no outer resize, message scroll, or outside dismissal |
| Tap to clear a selection/menu, then separately tap to begin typing | First tap changes only selection/menu; only the later typing action may open the keyboard |
| Select text; explicitly hide the keyboard or navigate; then deliver selection/menu cleanup callbacks | Cleanup cannot reopen the keyboard or restore the previous context |
| Type Chinese composing text; open/cancel add or effort; continue editing | No lost composition, caret jump, collapse, or keyboard cycle |
| Empty draft; focus; open/cancel tools; delete the last character | Same control structure throughout |
| Insert a plugin with keyboard open, then repeat with keyboard closed | One insertion at the retained position; closed keyboard does not reopen |
| Long text plus attachments; open/scroll/close plugins | No text compression, hidden attachments, or moving source controls |
| Search/select/cancel a model; repeat rapidly; simulate persistence failure | Stable selector, visible latest choice, no late focus/rollback |
| Choose media; cancel, deny permission, or fail presentation; then type | Draft unchanged, ownership released, next explicit focus works |
| Pick files; remove an importing tile; leave chat before completion | No resurrected tile or cross-chat attachment; library ownership intact |
| Import fails before send | Failed attachment remains explained; no silent partial message |
| Send; type another draft; fail the first admission | Next draft/caret untouched; failed content recoverable once |
| Send from a draft; create Session; stream; stop | Keyboard state and native editor survive; only the submitted content clears |
| Approval arrives during typing or a plugin/effort gesture | No forced modal, focus change, discarded gesture, or automatic approval |
| Scroll/select/copy message content; tap return-to-latest | One action, no incidental keyboard dismissal |
| Tap blank background with a panel open, then after it closes | First tap closes panel only; a separate blank tap may dismiss input |
| Close one panel and immediately edit/open another; deliver old callbacks | Old completion cannot steal focus or close the new panel |
| Visit settings/preview; switch chats; New Chat from same-Agent draft | Recover the right draft; fresh New Chat identity; no draft leakage |
| Keyboard events reorder; change orientation/input method; background/return | No focus repair loop; dock and hit targets match the visible UI |
| Repeated Back/Escape and screen-reader actions | One layer handles each action; permission remains pending unless answered |

Static source review can verify ownership and explicit commands. It cannot establish native
responder timing, keyboard smoothness, selection retention, or device conformance.
