# Marketplace

The sidebar's Marketplace keeps the existing `/skills` URL. It replaces the previous library /
discovery tabs with Skills / Agents, opens on discovery, and has no recommendation section.
`/skills/library` owns installed Skill management; the header's My library menu links there and to
the existing Agent list. Skill details and candidate/import URLs retain their existing routes.

`skills/` owns CherryIN and skills.sh discovery. Remote search uses the shared application search
route, preserving pagination, source filters and CherryIN / skills.sh / GitHub link resolution.
Selecting a result opens the existing Skill inspection and installation workflow. Skill creation
and adding Skills in chat remain available from My Skills, with the source conversation identity.

Both catalogs use content-sized, single-column rows with an identity, title, purpose and metadata.
The underlined Skills / Agents control owns the primary choice. Skill sources and Agent categories
use compact menus rather than another row of filled tabs. The header's icon-only library action
retains accessible naming without relying on a long label fitting inside the native toolbar slot.
Skill search still uses the shared search route; its result content matches the discovery rows.

`templates/` owns Agent catalog presentation, keyword search, category filters and full prompt preview.
The shared `frontend/data/agentTemplates` query reads the saved catalog before refreshing it.
A failed refresh keeps saved templates usable and offers Retry; first use without a snapshot
shows loading or a retryable failure. No full template catalog ships in the application bundle.
The list virtualizes individual rows, with separate preview and create targets. Rows take their
height from content rather than dividing an unspecified vertical space between card children.
An inline, content-sized `BottomSheet` retains the selected template and language until dismissal;
creation from its footer waits for dismissal before navigating. It uses the shared Markdown reader
for the full instructions. The sheet owns its single scroll viewport and clamps long content to
the available height; a direct route owns its own viewport around the same content. Native text
selection and scrolling remain available, and Copy preserves the exact original prompt, including
line endings.

Direct preview links retain `/skills/templates/:templateId` and share `AgentTemplateDetails` with
the inline sheet. Creation opens `/agents/new` with only `templateId`, `templateLanguage` and
`startChat=true`. The existing editor resolves that identity,
waits for catalog content, then seeds name/instructions once and displays the emoji. The draft keeps
its selected content through background updates, language changes and remote removals.
It retains its model, mode, approval and MCP controls, with a fixed Create and start chatting footer
for template drafts. Provider setup retains
the template identity in its return URL. Invalid template IDs show an unavailable state.

Catalog provenance, regional sources and snapshot policy live in
[`backend/services/agentTemplates`](../../../backend/services/agentTemplates/README.md). Templates copy content;
they never create tools, bindings or model configuration.
