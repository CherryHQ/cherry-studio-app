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
- Instructions keep one native multiline input mounted through expansion and collapse. The
  ordinary field is capped at 384 logical points (20% below its previous 480-point cap).
  Management pages allow direct editing; chat details use a scrollable reading preview while
  keeping the input mounted and hidden. The preview also stays mounted, retaining its scroll.
  This avoids disabling Android's native input scroller with a read-only field.
  The maximize action fills the available form region and focuses that same input. Collapse
  restores the surrounding form and its scroll position, and flushes pending auto-saves.
- Expansion hides surrounding form layout without unmounting fields or resetting their drafts.
  The existing sheet grows to full height and owns keyboard avoidance; pages use the shared
  keyboard-avoiding view pattern. Android back first dismisses the keyboard, then collapses the
  editor. Native selection and text scrolling stay with the input; the maximize/collapse
  button uses ordinary press cancellation and does not add a competing pan or text gesture.
- `utils/` owns form seeding, DTO construction and binding drafts. `components/` owns the private
  instruction, Skill and MCP sections. The route adapter only parses route parameters.
- The form's `PolicyScope` lives inside the native sheet portal, so hooks and fields share it.
  Route focus is read outside the portal and passed to auto-save so blur and dismissal still flush.
