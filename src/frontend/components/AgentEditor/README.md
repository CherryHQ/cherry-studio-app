# Agent Editor

`AgentEditor` owns the shared Agent form used by the management routes and the chat header.
Import it from `@/frontend/components/AgentEditor`.

- The default page presentation supports creation and editing. `shouldStartChat` opens a draft
  after creation; otherwise creation returns to the previous page.
- `presentation="sheet"` edits the supplied `agentId` in a handle-only overlay. `onClose` belongs
  to its caller; deletion closes the overlay without navigating away from chat. The sheet stays
  mounted while its loading, error and form content changes.
- Existing records auto-save through `hooks/useAgentAutoSave`. The form keeps the same field,
  avatar, model, Skill, MCP and managed-resource policy behavior in both presentations.
- Both presentations show a five-line, non-selectable instruction summary without internal
  scrolling. The summary stays plain text; Edit is the only entry and opens the complete instructions
  directly in the input. There is no separate reading mode or View full text action.
- Instructions use an independent `BottomSheet` with `size="full"` and `presentation="default"`.
  Its shared header stays outside the body, with only Done on the right. There is no visible Back
  button or repeated Agent name. System Back and accessibility escape close through `onBack`.
  The sheet uses explicit navigation without a drag handle or swipe/scrim dismissal.
  The native multiline input owns text scrolling, selection and caret visibility.
  The instruction sheet owns its keyboard space. The chat sheet
  becomes inactive through the existing nested-sheet lifecycle while keeping the form mounted.
  The form does not resize, hide fields, or reset/restore its scroll for instruction editing.
- Closing dismisses the keyboard and flushes existing auto-saves. The instruction sheet stays
  mounted until its closing transition finishes. Its value remains the form's draft; new Agents
  still require the form's explicit Save. `PolicySecret` gates the summary and sheet together, so
  organization-hidden instructions are never exposed by either surface.
- `utils/` owns form seeding, DTO construction and binding drafts. `components/` owns the private
  instruction, Skill and MCP sections. The route adapter only parses route parameters.
- The form's `PolicyScope` lives inside the native sheet portal, so hooks and fields share it.
  Route focus is read outside the portal and passed to auto-save so blur and dismissal still flush.
