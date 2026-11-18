# Marketplace

The sidebar's Marketplace keeps the existing `/skills` URL and opens on Skills discovery.
`/skills/library` owns installed Skill management; Skill details and candidate/import URLs retain
their existing routes.

## Screen

The page is one continuous surface, without cards or separators. Top to bottom:

1. The Skills tab's library button opens installed Skills with the source conversation identity.
   The sidebar's Agents destination opens the Agent list.
2. `InlineSearch` searches the open tab. Each tab keeps its own query.
3. Pill tabs (`Tabs variant="pill"`) choose Skills or Agents.
4. Titled sections preview each collection with up to three rows per column. If the collection has
   more entries, its title opens `/skills/browse` with the full list.

Phones use one column; windows wider than the form column use two (`useMarketplaceColumns`).
`MarketplaceRow` shows a 48-point rounded mark (emoji or initial on `card`), a one-line name and a
one-line purpose. Tapping anywhere on the row opens the entry's page. Sections and lists own the
row gutter.

Loading, empty and failure states use `ContentState` in place of a section's rows or a list's
content.

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
