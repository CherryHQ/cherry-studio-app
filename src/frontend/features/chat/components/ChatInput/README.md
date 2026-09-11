# Chat Input Behavior

`ChatInput` owns the Agent/Session composer controls. The
[Chat Input Interaction contract](../../../../../../docs/references/chat/input-interaction.md)
contains the operation matrix and remaining acceptance targets.

## Current Contract

- Keep a stable attachment row, full-width text area, and toolbar. Empty content, focus, blur,
  keyboard hiding, and lightweight panels do not switch layout modes or remount the native editor.
- Add, plugins, and reasoning effort preserve the current keyboard state. Plugin insertion does
  not call `focus()`. The plugin and effort panels occupy a shared popover above the composer;
  they neither compress text nor hide attachments. Raw anchor touches do not close panels, so
  selection handles and native editing-menu gestures do not become outside-dismiss commands.
- Model and library sheets use the shared transfer lifecycle. Native media/document pickers use
  the same policy. Returning releases dock tracking without reopening the keyboard. Model search
  retains its expanded size after blur or clearing during the same opening.
- Message touches, list scrolling, and local-send scrolling do not dismiss the composer. There is
  currently no chat-wide blank-area dismissal handler. System keyboard-hide controls remain native.
- Native text selection changes no application editing/layout state. Selection with an already
  closed keyboard and native insertion at a retained range still require iOS/Android acceptance.
- An Agent draft first sends through `startSession`, which admits content before creating the
  Session/message pair. Existing Sessions send through the live `AgentProtocol` client. The
  Draft-to-Session handoff keeps the composer and native editor mounted.
- Sending captures the visible model, effort, text, and ready attachments. It clears only that
  submitted draft without dismissing the keyboard. A synchronous lock rejects duplicate admission.
  Active turns use Stop; users may continue editing the next draft without queueing a turn.
- Admission failure restores the submitted content only when the cleared draft has not been
  edited. Otherwise the failure has its own Restore/Discard controls; replacing newer content
  requires confirmation. Failure feedback is nonmodal and late completion cannot change another
  mounted context.
- Model selection updates the Agent default. The visible pick is used for immediate sends, and
  rapid persistence is serial/coalesced. A current failure shows rollback feedback; an old failed
  request cannot overwrite a newer choice or show feedback in another context.
- Reasoning effort is local to subsequent sends. Supported values are retained across models;
  an unsupported choice resets to the model default with a visible explanation. `xhigh`, `max`,
  provider default, and `auto` remain distinct. Slider movement previews a value; successful release
  commits it, while cancellation restores the starting stop.
- Plugins insert one inline reference at the native insertion range. An existing reference is not
  duplicated. Catalog failure leaves an open panel with unavailable feedback. No plugin is
  automatically authorized or connected.
- Files opens a fresh library selection. Add stages available entries once; Close discards pending
  selection. Upload closes the library and opens the document picker. Imports preserve library
  ownership; a removed tile cannot reappear from late completion. Failed imports stay visible and
  block sending until removed/reselected.
- Incoming tool approvals expose a pending review action without opening a sheet or disabling
  draft editing. Explicit review opens details. Closing leaves permission pending; only Allow,
  Deny, or Stop submits a decision. Each next request requires explicit review.

## Remaining Targets

Mounted sessions isolate drafts, but retaining drafts/failed submissions across screen unmounts
and allocating a fresh same-Agent New Chat identity remain separate navigation work. Recognized
blank-area taps, complete Back/Escape arbitration across all destinations, and native selection
acceptance are also still outstanding. The contract is not a claim that these targets passed.
