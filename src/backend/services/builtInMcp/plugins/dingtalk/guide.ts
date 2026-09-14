import type { PluginGuideDefinition } from '../../pluginGuide';

export const dingtalkGuide = {
  revision: 4,
  sections: [
    {
      requiredTools: [],
      content: `# DingTalk / 钉钉
Services depend on organization access and user grants. An organization-only account label does not
prove employee identity. Additional authorization belongs on the plugin connection page, never in
chat; the user must explicitly retry afterward. Inspect business result fields as well as isError.`,
    },
    {
      requiredTools: ['get_document_content'],
      content: `## Read a document
Read a known document directly. Search only for an unresolved target; fetch metadata only when its
identity or content format remains unclear after using available context.`,
    },
    {
      requiredTools: ['get_document_content', 'update_document'],
      content: `## Modify a document
update_document may replace the whole body: replacement needs complete current content. Use the
required content format; raw Markdown cannot substitute for JSONML.`,
    },
    {
      requiredTools: ['create_document', 'update_document'],
      content: `## Populate a newly created document
If creation needs a separate content update, reuse the returned nodeId and URL. An update failure
leaves a partially created document; report it rather than creating another.`,
    },
    {
      requiredTools: ['search_wikiSpaces'],
      content: `## Knowledge spaces
Search only for an unresolved space. Space results identify knowledge spaces, not document content;
a wiki space ID is not a document node ID.`,
    },
    {
      requiredTools: ['search_files'],
      content: `## Drive files
Reuse a known drive scope without listing spaces first. Drive file IDs, wiki space IDs and document
node IDs identify different resource types.`,
    },
    {
      requiredTools: ['download_file'],
      content: `## Download a file
Download results supply access information; they do not prove that a local file has been saved.`,
    },
    {
      requiredTools: ['query_records', 'get_fields'],
      content: `## Query table records
Reuse known baseId and tableId. Inspect field definitions only when needed to formulate filters or
interpret typed cells.`,
    },
    {
      requiredTools: ['create_records'],
      content: `## Create table records
Batch creation can partially succeed. Report returned record IDs and failures before any retry;
keep successful records instead of resubmitting the entire batch.`,
    },
    {
      requiredTools: ['get_range_as_csv'],
      content: `## Spreadsheet values
Read a known sheet range directly; fetch metadata only to resolve missing sheet or range context.
An empty range does not establish that the whole sheet is empty.`,
    },
    {
      requiredTools: ['search_messages_by_keyword'],
      content: `## Search messages
Search results may omit inaccessible or encrypted content; missing matches do not establish that a
conversation has no messages.`,
    },
    {
      requiredTools: ['get_email_by_message_id'],
      content: `## Read mail
Read a known message directly, reusing its mailbox and message ID. Search only when the target is
unresolved.`,
    },
    {
      requiredTools: ['create_draft'],
      content: `## Draft new mail
New mail needs no old message or thread unless the request depends on that context. Create a cloud
draft when requested; a request for wording alone can be answered in chat. A draft is not sent mail.`,
    },
    {
      requiredTools: ['get_email_by_message_id', 'create_reply_draft'],
      content: `## Draft a reply
Read the original message if its relevant content is not already available, then create_reply_draft
for that message. Reuse its mailbox and message ID instead of searching again.`,
    },
    {
      requiredTools: ['send_draft'],
      content: `## Send an existing draft
Use send_draft for the requested draft ID and approved content; do not create a replacement draft.`,
    },
    {
      requiredTools: ['get_processInstance_detail'],
      content: `## Read an approval
Approval tasks belong to process instances and are separate from personal to-dos. Read a known
instance directly instead of listing pending tasks to rediscover it.`,
    },
    {
      requiredTools: ['get_process_schema', 'start_process_instance'],
      content: `## Start an approval
Use the process schema for required form fields before start_process_instance. An existing instance
is not a prerequisite for starting a new one.`,
    },
    {
      requiredTools: ['get_minutes_ai_summary', 'get_minutes_transcription'],
      content: `## Verify meeting details
Use the original transcription for quotations or material details needing verification. A request
for the AI summary alone does not require fetching the full transcript.`,
    },
    {
      requiredTools: ['get_report_entry_details'],
      content: `## Work reports
Work reports are business submissions, not system logs. Read a known report directly; list reports
only when its target is unresolved.`,
    },
    {
      requiredTools: ['get_user_attendance_record'],
      content: `## Attendance
Query the requested people and dates. Unavailable attendance records do not establish absence.`,
    },
    {
      requiredTools: ['get_user_todos_in_current_org'],
      content: `## Organization tasks
Task lists are scoped to the authorized organization. A missing result object is not an empty task
list.`,
    },
    {
      requiredTools: ['get_todo_detail', 'update_todo_done_status'],
      content: `## Complete a task
Distinguish task-wide completion from a participant's own state before update_todo_done_status.`,
    },
    {
      requiredTools: ['list_calendar_events'],
      content: `## Calendar events
Use a known calendar and the requested date range directly. List calendars only when the target
calendar is unresolved.`,
    },
    {
      requiredTools: ['list_suggested_event_times'],
      content: `## Suggested meeting times
Suggested times are not guaranteed reservations.`,
    },
  ],
} satisfies PluginGuideDefinition;
