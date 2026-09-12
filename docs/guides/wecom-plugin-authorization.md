# WeCom plugin authorization

The plugin imports user-authorized official WeCom cloud MCP connections. It exposes a reviewed
subset: create/replace document content, list/read/create/update tasks and change the user's task
status, list/read/create/update schedules and query availability. Document search and document
reading are not included in this initial tool set. The newer official platform supports more
capabilities; this is a plugin scope limit, not a claim that WeCom cannot provide them.

## Obtain your configuration

1. In WeCom open Workbench → Smart Robot → Manage, create or edit an **API-mode robot**.
2. Open Available Permissions → Authorize. Grant the document, task and/or schedule capabilities
   you need. The organization may require administrator approval. A WeChat account alone is not
   sufficient; an eligible WeCom organization and robot creation permission are required. Personal
   team-form organizations do not support all robot features.
3. Open the arrow next to the permission group and copy **Streamable HTTP URL** or **JSON Config**.
4. In Cherry Studio → Plugins → WeCom, paste one URL, or a JSON object containing up to three
   `mcpServers` entries copied from those permission groups. Keep every URL exactly as provided.
   Use a single entry per service; do not import the same service twice.
5. Connect. Cherry validates discovery without creating a document, task or schedule. The saved
   label is “Official MCP”: it does not claim to verify an employee or organization identity.

A single configuration has this structure (replace the entire URL with the official copied value):

```json
{
  "mcpServers": {
    "documents": { "type": "streamable-http", "url": "<official document MCP URL>" },
    "tasks": { "type": "streamable-http", "url": "<official task MCP URL>" },
    "calendar": { "type": "streamable-http", "url": "<official schedule MCP URL>" }
  }
}
```

Delete entries you do not use. Only HTTPS URLs on `qyapi.weixin.qq.com` under `/mcp/` are accepted.
Optional `Authorization` headers are supported if present in the official export. Executable
`command`/`args`/`env` configurations and other hosts are rejected. Do not paste Bot Secret into the
URL field or substitute a traditional enterprise application access token.

The full URL may contain an authorization credential. It is kept in native secure storage and
excluded from the public catalog. Do not post exported URLs in issues, chat messages or logs.
To change the configuration, disconnect first, authorize the intended permissions, and import the
new export. Cherry does not automatically renew an imported URL. Expiration and revocation are
controlled in WeCom. Local disconnect does not revoke the robot's platform permissions.

## Capability boundaries

The admitted MCP tool names are based on Tencent Cloud's published WeCom integration at
`5edda565415e29e30f6388c2160f750bb026ec32`: `create_doc`, `edit_doc_content`, `get_todo_list`,
`get_todo_detail`, `create_todo`, `update_todo`, `change_todo_user_status`,
`get_schedule_list_by_range`, `get_schedule_detail`, `check_availablity` (upstream spelling),
`create_schedule`, `update_schedule`. Input schemas are read from the authorized server, never
inferred from CLI commands. The platform may return a different generation of tool names; unknown
tools remain unavailable until their contracts are reviewed. A configured service with no admitted
tools fails setup explicitly.

`edit_doc_content` replaces a document's full content. Some document grants permit only editing
robot-created documents. The update-task tool accepts only completion/in-progress status values,
excluding the upstream deletion status. The first version does not expose deletion, chat history,
conversation archiving, outbound messaging or company directory tools. Tasks and calendar writes can notify
people and use the existing write-approval controls. A successful tool list does not imply all
business operations are authorized. Read each result's business status and per-item success.

## Sources and acceptance

- [Official CLI and cloud MCP setup](https://open.work.weixin.qq.com/help2/pc/21676)
- [Official capability overview](https://open.work.weixin.qq.com/help2/pc/21714)
- [Robot creation permissions](https://open.work.weixin.qq.com/help2/pc/21676)
- [Official WeCom CLI](https://github.com/WecomTeam/wecom-cli)
- [Tencent Cloud WeCom integration](https://github.com/TencentCloud-Lighthouse/openclaw-wecom/tree/5edda565415e29e30f6388c2160f750bb026ec32)

Public documentation and source contracts were reviewed. No real organization's MCP configuration
was supplied, so live discovery compatibility, grant expiry and business operations still need
account acceptance before release. No real authorization or write was performed in implementation.
