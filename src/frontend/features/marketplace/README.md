# Marketplace

The sidebar's Marketplace keeps the existing `/skills` URL and opens on Skills discovery. It has no
recommendation section. `/skills/library` owns installed Skill management; Skill details and
candidate/import URLs retain their existing routes.

## Screen

One shape serves both catalogs, top to bottom:

1. The header's library button follows the open catalog and opens it in one tap: installed Skills
   (with the source conversation identity) or the Agent list. It is icon-only with a native toolbar
   glyph, so long translations never compete for the toolbar slot.
2. `InlineSearch` searches the open catalog. Each catalog keeps its own query; switching back
   restores it.
3. The platform segmented control chooses Skills or Agents.
4. A scrollable chip row holds the catalog's secondary choice, always visible: the Skill source
   (CherryIN / skills.sh) or the Agent category.
5. `MarketplaceList` renders the results as one virtualized inset group, the same surface as the
   Agent list and settings. Rows show identity, title, a two-line purpose and optional metadata,
   with a chevron. A row has exactly one target: it opens the item's page. Install and create
   live on that page's footer, never on the row.

Loading, empty and failure states use `ContentState` inside the list. Feature components keep row
content; the list owns gutters, the card slices, separators and the press target.

## Skills

`skills/` browses and searches CherryIN or skills.sh in place. Queries settle for 300 ms before a
remote request. CherryIN pages load on scroll; a failed page offers Retry in the list footer. A
pasted CherryIN, skills.sh or GitHub link resolves to its package regardless of the selected
source. Selecting a result opens the existing CherryIN detail or candidate inspection workflow.
Skill rows carry no avatar, matching installed Skill rows; metadata shows collection and install
counts.

## Agents

`templates/` filters the saved catalog locally by keyword and category. The shared
`frontend/data/agentTemplates` query reads the saved catalog before refreshing it. A failed refresh
keeps saved templates usable with a quiet Retry note above the list; first use without a snapshot
shows loading or a retryable failure. No full template catalog ships in the application bundle.

A row opens `/skills/templates/:templateId` with the browsing language. The page centers the emoji
avatar, name, categories and purpose, then shows the complete instructions in the shared Markdown
reader with native selection. The header's Copy action preserves the exact original prompt,
including line endings. The fixed footer holds the page's single primary action.

Creation opens `/agents/new` with only `templateId`, `templateLanguage` and `startChat=true`. The
existing editor resolves that identity, waits for catalog content, then seeds name/instructions once
and displays the emoji. The draft keeps its selected content through background updates, language
changes and remote removals. It retains its model, mode, approval and MCP controls, with a fixed
Create and start chatting footer for template drafts. Provider setup retains the template identity
in its return URL. Invalid template IDs show an unavailable state.

Catalog provenance, regional sources and snapshot policy live in
[`backend/services/agentTemplates`](../../../backend/services/agentTemplates/README.md). Templates copy content;
they never create tools, bindings or model configuration.
