import type { PluginGuideDefinition } from '../../pluginGuide';

export const feishuGuide = {
  revision: 4,
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
      requiredTools: ['wiki_list_spaces', 'list-docs'],
      content: `## Browse knowledge spaces

Use \`wiki_list_spaces\` to find the intended space, then the official \`feishu list-docs\` to browse
its documents. Continue pagination; a space listing is not a listing of every document in it.`,
    },
    {
      requiredTools: ['base_list_views', 'base_get_view'],
      content: `## Inspect a Base view

Use \`base_list_views\` to locate the view and \`feishu base_get_view\` for its filter and hidden
fields. Preserve the original table and view when reading a shared link.`,
    },
    {
      requiredTools: ['base_list_fields', 'base_batch_create_records'],
      content: `## Create records in a batch

Inspect \`base_list_fields\`, then use \`feishu base_batch_create_records\` for at most 100 records
per call. Keep each batch within the request size limit and retain the returned record IDs.
Reuse client_token only for the same intended creation; do not blindly replay uncertain writes.`,
    },
    {
      requiredTools: ['base_list_fields', 'base_get_record', 'base_batch_update_records'],
      content: `## Update records in a batch

Inspect field definitions and each target record, then use \`feishu base_batch_update_records\`
with distinct record IDs and only the requested fields. Omitted fields stay unchanged; null clears
a value. Check every returned record and inspect uncertain outcomes before retrying.`,
    },
    {
      requiredTools: ['calendar_get_event', 'calendar_delete_event'],
      content: `## Cancel an event

Read \`calendar_get_event\` and confirm the intended occurrence or series before using
\`feishu calendar_delete_event\`. Cancellation can notify every attendee.`,
    },
    {
      requiredTools: ['calendar_get_event', 'calendar_reply_event'],
      content: `## Respond to an invitation

Read \`calendar_get_event\`, then use \`feishu calendar_reply_event\` to accept, decline or tentatively
accept as the connected user. Declining an invitation does not cancel the organizer's event.`,
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
