# Marketplace

The sidebar's Marketplace keeps the existing `/skills` URL and opens on Skills discovery.
`/skills/library` owns installed Skill management; Skill details and candidate/import URLs retain
their existing routes.

## Screen

The page is one continuous surface, without cards or separators. Top to bottom:

1. The shared `InlineSearch` appears below the title, using the Agent list's layout. Each tab
   keeps its own query. Typing shows market results and clearing restores the library preview.
2. Pill tabs (`Tabs variant="pill"`) choose Skills or Agents.
3. My Skills or My Agents shows up to four entries from the corresponding local library query.
   Each entry opens its existing detail or editor. The section title opens the management page.
   My Skills carries the source conversation identity into that page.
4. The discovery section previews each market collection with up to three rows per column. If it has
   more entries, its title opens `/skills/browse` with the full list.

Phones use one column; windows wider than the form column use two (`useMarketplaceColumns`).
`MarketplaceRow` shows a 48-point rounded mark, a one-line name and a one-line purpose. Skills use
the shared tool-case glyph in both the market and My Skills. Templates use their emoji or initial.
Tapping anywhere on the row opens the entry's page. Sections and lists own the row gutter.

Loading, empty and failure states use `ContentState` in place of a section's rows or a list's
content. Empty libraries and collections use the shared collection illustration. Searches with no
matches use the shared search illustration.

## Skills

`skills/useSkillDiscovery` owns one source's browse or search results. Queries settle for 300 ms
before a remote request. The tab previews CherryIN and skills.sh as sections over the same query.
A pasted CherryIN, skills.sh or GitHub link replaces the sections with that package's results. The
browse page pages CherryIN on scroll and offers Retry when a page fails. Selecting a result opens
the existing CherryIN detail or candidate inspection workflow.

## Agents

Without a query, templates preview by category in category order; a template appears under each of
its categories and one without a category under More. A query lists every match in one virtualized
list. The shared `frontend/data/agentTemplates` query reads the saved catalog before refreshing it.
A failed refresh keeps saved templates usable with a quiet Retry note; first use without a snapshot
shows loading or a retryable failure. No full template catalog ships in the application bundle.

A row opens `/skills/templates/:templateId` with the browsing language. The page shows the mark,
name, categories and purpose, then the complete instructions in the shared Markdown reader with
native selection. The header's Copy action preserves the exact original prompt, including line
endings. The fixed footer holds the page's single primary action.

The detail footer opens `/agents/new` with only `templateId`, `templateLanguage` and
`startChat=true`. The existing editor resolves that identity, waits for
catalog content, then seeds name/instructions once and displays the emoji. The draft keeps its
selected content through background updates, language changes and remote removals. It retains its
model, mode, approval and MCP controls, with a fixed Create and start chatting footer for template
drafts. Provider setup retains the template identity in its return URL. Invalid template IDs show
an unavailable state.

Catalog provenance, regional sources and snapshot policy live in
[`backend/services/agentTemplates`](../../../backend/services/agentTemplates/README.md). Templates copy content;
they never create tools, bindings or model configuration.
