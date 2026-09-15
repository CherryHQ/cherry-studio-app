import type { PluginGuideDefinition } from '../../pluginGuide';

// Adapted from the official CLI's MCP workflow references at
// https://github.com/WecomTeam/wecom-cli/tree/9eb7898b959861af879495e211e37431fa908f19/skills
// Current capabilities: https://open.work.weixin.qq.com/help2/pc/21714
export const wecomGuide = {
  revision: 5,
  sections: [
    {
      requiredTools: [],
      content: `# WeCom
This connection exposes the user's authorized official WeCom MCP services. The current tool catalog
is authoritative for available operations, descriptions, input schemas and limits. Use those exact
tools directly. Cherry qualifies names by service to avoid collisions; do not translate CLI commands
into guessed tool names or parameters. No local CLI executable is available through this plugin.

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
Some create operations return an empty document: use the returned ID and an editing tool to fill it.
Read existing content before an overwrite. For tables, retrieve sheet and field metadata first, reuse
returned IDs, and follow the discovered typed cell formats. For smart pages, read actual page/block
IDs before modifying their structure. Use separate member/sharing tools only for requested changes.

## People, tasks, calendars and meetings
Resolve people through authorized contact or service-specific lookup tools; disambiguate names before
assigning tasks or inviting attendees. Use the user's timezone and explicit time windows. For updates,
read the existing item and preserve participants and fields outside the request; participant arrays
may replace the entire list. Completing a task and deleting it are separate actions. Check availability
and resolve meeting rooms through the available tools before booking. A task or schedule ID returned
by one service is not a meeting ID.

## Mail and messages
For mail replies and forwards, read the original mail and follow the official tool's recipient and
thread fields. For bot messages, use the available session/chat lookup to identify a permitted target;
contact membership alone does not establish an allowed bot conversation. Respect the official message
types, size limits and recipient scope. Search/read operations do not authorize sending mail or messages.

## Files and asynchronous results
Use the formats the actual MCP tools accept: content, URLs, media IDs or other documented fields.
A file path from desktop CLI documentation is not automatically accessible to the remote service.
Only upload local files when an available tool can actually supply their contents. Do not claim that
a returned server path is a file saved on this device. Returned attachments may be metadata only.
When a tool returns a task ID and an incomplete status, follow its documented status/polling operation
until completion; reuse that task ID rather than submitting the original write again. Follow pagination
fields for lists. Inspect isError, errcode and per-item results before reporting success, and include
the resulting source links when available.`,
    },
  ],
} satisfies PluginGuideDefinition;
