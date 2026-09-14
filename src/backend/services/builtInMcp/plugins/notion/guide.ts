import type { PluginGuideDefinition } from '../../pluginGuide';

export const notionGuide = {
  revision: 2,
  sections: [
    {
      requiredTools: [],
      content: `# Notion
Use this connection for Notion knowledge, pages and database records within the connected user's
permissions. Include source page links. Attachments and Notion agents are unavailable.
Reuse successful results for this connection in the current turn. Do not repeat equivalent searches
or fetch unchanged pages or data-source schemas again. Re-read after a relevant write, an explicit
refresh request or evidence of change. Stop once the requested answer or action is supported.`,
    },
    {
      requiredTools: ['notion-fetch', 'notion-search'],
      content: `## Search
Before content search, fetch id self once per connection per turn; reuse self.current_tool_access.
Use notion-ai-search when ai_search reports available and that tool is exposed; otherwise use
notion-search. Do not run both for the same query just to confirm results. Search again only to fill
a specific evidence gap. Tool visibility does not guarantee plan access; report plan or access
failures without retrying unchanged requests.`,
    },
    {
      requiredTools: ['notion-fetch'],
      content: `## Read
Fetch a supplied Notion URL or ID directly instead of searching for it. Fetch relevant Notion search
matches before summarizing their content, reusing pages already read. Connected-source search hits
cannot be read with notion-fetch. For truncated pages, fetch the returned unknown_block_ids needed
for the task instead of the parent again. Continue pagination only as needed; identify partial results.`,
    },
    {
      requiredTools: ['notion-fetch', 'notion-create-pages', 'notion-update-page'],
      content: `## Save and update
Reuse current destination content or data-source schema from this turn; fetch it if missing or stale.
For a database record, inspect its properties and types before create-pages or update-page.
Use the correct parent/record ID and prefer an append or narrow edit when requested.
After an ambiguous write outcome, inspect the destination before retrying. Return the saved page link.`,
    },
  ],
} satisfies PluginGuideDefinition;
