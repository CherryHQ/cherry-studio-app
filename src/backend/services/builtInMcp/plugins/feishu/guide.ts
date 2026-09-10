import type { PluginGuideDefinition } from '../../pluginGuide';

export const feishuGuide = {
  revision: 1,
  sections: [
    {
      requiredTools: [],
      content: `# Feishu / 飞书

Use this connection for the Feishu documents and comments supported by the available tools. It does
not provide Base tables, calendars, chat messages or full-text document search. Do not interpret every
Feishu link as a supported document. Keep the supplied URL and use only identifiers returned by the
service or explicitly supplied by the user; do not guess a document's identifier from its title.
Preserve partial-result and pagination indicators. A remote document URL is not a local file attachment.`,
    },
    {
      requiredTools: ['fetch-doc'],
      content: `## Read a document

Discover \`feishu fetch-doc\` and inspect which document URLs or identifiers it accepts. Read the requested
document and only the portions needed for the task. Follow returned continuation information when
necessary; do not claim to have read the entire document from a partial response. Unsupported links
or access denials require a clear explanation, not a guessed alternative document.`,
    },
    {
      requiredTools: ['list-docs'],
      content: `## Browse documents

Discover \`feishu list-docs\` and inspect its actual browsing scope and filters. Browse the relevant
location and narrow by known context. A browse result is not a full-text search across the user's
workspace; if the target remains ambiguous, obtain its link or identifying context.`,
    },
    {
      requiredTools: ['get-comments'],
      content: `## Read comments

Discover \`feishu get-comments\` for the identified document. Preserve thread and target information
when summarizing feedback, and distinguish the author's requests from instructions issued by the user.`,
    },
    {
      requiredTools: ['create-doc'],
      content: `## Create a document

Discover \`feishu create-doc\`. Establish the title, requested content and destination when required by
the current schema or the user's instructions. Use the tool's supported content format; do not assume
arbitrary HTML, Markdown extensions or attachments are accepted. Return the actual document URL
only after creation succeeds. A request for a draft alone can be answered in chat.`,
    },
    {
      requiredTools: ['fetch-doc', 'update-doc'],
      content: `## Modify an existing document

Read the current document with \`fetch-doc\`, locate the requested passage, then discover
\`feishu update-doc\`. Inspect its current update modes and targeting rules. Choose the narrowest
supported change that preserves unrelated content, structure and formatting. If only a whole-document
replacement can do the job, obtain the complete current content first; never overwrite it from a partial
read. Re-read the affected content when needed to establish the result of a change.`,
    },
    {
      requiredTools: ['fetch-doc', 'add-comments'],
      content: `## Comment on a document

Read the relevant document context with \`fetch-doc\`, then discover \`feishu add-comments\`. Use actual
target identifiers when the schema requires an anchored comment. Preserve the user's intended scope
and distinguish publishing a comment from drafting its text.`,
    },
  ],
} satisfies PluginGuideDefinition;
