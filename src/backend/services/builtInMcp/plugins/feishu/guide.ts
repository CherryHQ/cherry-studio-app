import type { PluginGuideDefinition } from '../../pluginGuide';

export const feishuGuide = {
  revision: 3,
  sections: [
    {
      requiredTools: [],
      content: `# Feishu / 飞书

Search Feishu tools by domain: documents, people, Base, tasks or calendar. Only some domains may be
available. Documents and Base records need different readers; tasks do not include approvals. Use
available people lookup or verified open IDs for people fields, task members and event attendees.`,
    },
    {
      requiredTools: ['fetch-doc'],
      content: `## Read a document

Use \`feishu fetch-doc\` for document content, continuing partial reads as needed. Base records require
Base tools.`,
    },
    {
      requiredTools: ['fetch-doc', 'update-doc'],
      content: `## Modify an existing document

Read \`fetch-doc\`, then make a targeted change with \`feishu update-doc\`. Whole-document replacement
requires the complete current content; preserve unrelated content and formatting.`,
    },
    {
      requiredTools: ['fetch-doc', 'add-comments'],
      content: `## Comment on a document

Read the relevant context with \`fetch-doc\`, then use \`feishu add-comments\` with the actual target
identifiers when publication is requested.`,
    },
    {
      requiredTools: ['wiki_get_node'],
      content: `## Resolve a wiki link

Resolve /wiki/ links with \`feishu wiki_get_node\`; check the resource type and use its obj_token for
Base calls. Preserve the original table and view parameters.`,
    },
    {
      requiredTools: ['base_list_fields', 'base_search_records'],
      content: `## Query Base records

Inspect \`base_list_fields\`, then use \`feishu base_search_records\` for the intended table/view.
Match actual field names and identify the intended record among same-name results.`,
    },
    {
      requiredTools: ['base_list_fields', 'base_create_record'],
      content: `## Create a Base record

Read \`base_list_fields\`, then use \`feishu base_create_record\` with the intended field values and
options in the existing table.`,
    },
    {
      requiredTools: ['base_list_fields', 'base_search_records', 'base_update_record'],
      content: `## Update a Base record

Read \`base_list_fields\`, locate the record with \`base_search_records\`, then use
\`feishu base_update_record\` for the requested fields of that record.`,
    },
    {
      requiredTools: ['task_get', 'task_update'],
      content: `## Update or complete a task

Read \`task_get\` before \`feishu task_update\`. Completion affects the entire task and all assignees,
not just the current user's part.`,
    },
    {
      requiredTools: ['calendar_get_event', 'calendar_update_event'],
      content: `## Update an event

Read \`calendar_get_event\` before \`feishu calendar_update_event\`; preserve the intended occurrence
or series when choosing the event ID.`,
    },
    {
      requiredTools: ['calendar_get_freebusy'],
      content: `## Check availability

An access failure from \`feishu calendar_get_freebusy\` is not evidence that the person is free.`,
    },
    {
      requiredTools: ['calendar_get_event', 'calendar_add_attendees'],
      content: `## Invite event attendees

Inspect the target with \`calendar_get_event\`, then use \`feishu calendar_add_attendees\` for the
requested people. Creating an event alone does not invite them.`,
    },
  ],
} satisfies PluginGuideDefinition;
