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
- Instructions open in read mode. Scrolling the text cannot focus an input; the explicit Edit
  action starts editing, and Done or blur returns to read mode and flushes pending auto-saves.
- `utils/` owns form seeding, DTO construction and binding drafts. `components/` owns the private
  instruction, Skill and MCP sections. The route adapter only parses route parameters.
- The form's `PolicyScope` lives inside the native sheet portal, so hooks and fields share it.
  Route focus is read outside the portal and passed to auto-save so blur and dismissal still flush.
