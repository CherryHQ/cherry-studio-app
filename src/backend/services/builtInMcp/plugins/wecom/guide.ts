import type { PluginGuideDefinition } from '../../pluginGuide';

// Adapted from the official CLI's MCP workflow references at
// https://github.com/WecomTeam/wecom-cli/tree/9eb7898b959861af879495e211e37431fa908f19/skills
// Meeting/calendar routing:
// https://github.com/WecomTeam/wecom-cli/blob/1cd90a5337ce11ffbcf14c5ad2e85e6ee97c8b08/skills/wecomcli-meeting/SKILL.md
// Current capabilities: https://open.work.weixin.qq.com/help2/pc/21714
export const wecomGuide = {
  revision: 6,
  sections: [
    {
      requiredTools: [],
      content: `# WeCom
This connection exposes the user's authorized official WeCom MCP services. The current tool catalog
defines available operations, parameters and limits. Cherry qualifies tool names by service; do not
translate CLI commands into guessed calls. No local CLI executable is available through this plugin.
Reuse successful results for this connection in the current turn, including verified IDs, content
and table metadata. Fetch missing or stale information; re-read after a relevant write, an explicit
refresh request, evidence of change or a tool's freshness requirement. Avoid equivalent lookups.

WeCom permissions belong to the authorizing user and bot. Discovery does not imply enterprise-wide
data access. A service may have creation permission without search/read permission. When access is
denied, direct the user to the bot's permission page in WeCom; some data access requires administrator
approval. After changing authorization, refresh tools or reconnect if the service is still missing.
Some document connections act as an independent enterprise bot rather than the authorizing user.
That bot does not automatically inherit the user's existing document permissions. An object-access
denial can require granting the bot access to that document, even when its document capability is authorized.

## Documents and tables
Use the URL to distinguish document types: /doc/ is a text document, /sheet/ a spreadsheet,
/smartsheet/ a smart table and /smartpage/ a smart document. They can share the doc service while
requiring different tools. A document-type error means to check the URL and select the matching tool.
If creation returns an empty document, fill it using the returned ID. If filling fails after creation,
report the created ID/link and resume editing that document instead of creating another one.
For table edits, use current sheet and field metadata, fetching it only when missing or stale. Follow
the tool's typed cell formats. A new smart table may already contain a default subtable and field:
inspect and reuse suitable defaults, rename a compatible default field, and add only missing fields.
Add another subtable only when needed; renaming a field does not change its type. For smart pages,
use actual page/block IDs from the relevant content or structure. Use separate member/sharing tools
only for requested changes.

## People, tasks, calendars and meetings
Reuse verified person IDs; resolve missing IDs or ambiguous names through authorized contact or
service-specific lookup tools. Use the user's timezone and explicit time windows. Participant arrays
may replace the entire list, so merge requested changes into the current list. Completing a task and
deleting it are separate actions. A task or schedule ID is not a meeting ID.
Use schedules for calendar events and meetings for online/video participation or a join link. If
creation intent remains ambiguous, clarify that distinction. Creating an online meeting also creates
its calendar event; do not create a second schedule for it. For an ambiguous meeting query, search
the available schedule and meeting services using the same scope and merge entries for the same event.
Check availability before booking; resolve a meeting room only when needed. When adding attendees
without changing the time, check only the new attendees so this event's existing bookings do not
appear as conflicts.

## Mail and messages
For replies and forwards, use the original mail's recipient/thread data and relevant content; fetch
the original only if this context is missing or stale. For bot messages, establish a permitted target
through the official tool's identity/session rules, reusing valid lookup results where allowed;
contact membership alone does not establish an allowed bot conversation. Respect the official message
types, size limits and recipient scope. Search/read operations do not authorize sending mail or messages.

## Files and asynchronous results
Use the formats the actual MCP tools accept: content, URLs, media IDs or other documented fields.
A file path from desktop CLI documentation is not automatically accessible to the remote service.
Only upload local files when an available tool can actually supply their contents. Do not claim that
a returned server path is a file saved on this device. Returned attachments may be metadata only.
For an incomplete asynchronous task, reuse its task ID with the documented status tool. Respect
polling intervals, retry delays and limits; if no limit is documented, make at most three status
checks in this turn. Stop on completion, failure, cancellation or expiry. If still pending or no
status tool is available, report the pending state and task ID instead of claiming completion or
resubmitting the original write. Inspect isError, errcode and per-item results before reporting
success, and include resulting source links when available.`,
    },
  ],
} satisfies PluginGuideDefinition;
