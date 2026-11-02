# Agent Editor

`AgentEditor` owns the shared Agent form used by the management routes and the chat header.
Import it from `@/frontend/components/AgentEditor`.

- The default page presentation supports creation and editing. `shouldStartChat` opens a draft
  after creation; otherwise creation returns to the previous page.
- `presentation="sheet"` edits the supplied `agentId` in a handle-only overlay. `onClose` belongs
  to its caller; deletion closes the overlay without navigating away from chat.
- Existing records auto-save through `hooks/useAgentAutoSave`. The form keeps the same field,
  avatar, model, Skill, MCP and managed-resource policy behavior in both presentations.
- `utils/` owns form seeding, DTO construction and binding drafts. `components/` owns the private
  Skill and MCP sections. The route adapter only parses route parameters.
- The native sheet portal receives its own `PolicyScope`; form hooks read the original scope
  before crossing the portal.
