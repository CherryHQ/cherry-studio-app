# Marketplace

The sidebar's Marketplace keeps the existing `/skills` URL. It replaces the previous library /
discovery tabs with Skills / Agents, opens on discovery, and has no recommendation section.
`/skills/library` owns installed Skill management; the header's My library menu links there and to
the existing Agent list. Skill details and candidate/import URLs retain their existing routes.

`skills/` owns CherryIN and skills.sh discovery. Remote search uses the shared application search
route, preserving pagination, source filters and CherryIN / skills.sh / GitHub link resolution.
Selecting a result opens the existing Skill inspection and installation workflow. Skill creation
and adding Skills in chat remain available from My Skills, with the source conversation identity.

`templates/` owns Agent catalog presentation, keyword search, category filters and full prompt preview.
The shared `frontend/data/agentTemplates` query reads the saved catalog before refreshing it.
A failed refresh keeps saved templates usable and offers Retry; first use without a snapshot
shows loading or a retryable failure. No full template catalog ships in the application bundle.
The grid virtualizes pairs of cards, with separate preview and create targets. Text scrolling and
selection use React Native's native interaction; there is no competing long-press handler. The copy
action copies the complete original prompt, including its line endings.

Preview uses `/skills/templates/:templateId`, and quick creation opens `/agents/new` with only
`templateId`, `templateLanguage` and `startChat=true`. The existing editor resolves that identity,
waits for catalog content, then seeds name/instructions once and displays the emoji. The draft keeps
its selected content through background updates, language changes and remote removals.
It retains its model, mode, approval and MCP
controls, with a fixed Create and start chatting footer for template drafts. Provider setup retains
the template identity in its return URL. Invalid template IDs show an unavailable state.

Catalog provenance, regional sources and snapshot policy live in
[`backend/services/agentTemplates`](../../../backend/services/agentTemplates/README.md). Templates copy content;
they never create tools, bindings or model configuration.
