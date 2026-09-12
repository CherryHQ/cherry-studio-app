# DingTalk plugin authorization

This plugin imports official user/organization-authorized MCP configurations for DingTalk documents,
tasks and calendar. It supports document search/read/create/update, task listing/details/create/
update/completion and calendar listing/details/create/update/suggested times. It does not read
encrypted chats or expose deletion, messaging, approval processing or contact administration.

## Obtain an official configuration

1. Sign in to the official [DingTalk MCP platform](https://mcp.dingtalk.com) and authorize the
   document, task and/or calendar services for the intended organization. Follow any administrator
   approval required by that organization.
2. Copy each official service's Streamable HTTP configuration. Users of the official
   [DWS CLI](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli) can obtain an export with
   `dws mcp url get <mcpId> --format json` after their normal login. Use the actual market ID of the
   desired service; `doc`/`todo`/`calendar` are not numeric market IDs. The command returns `mcpURL`
   and `mcpJSON` inside its result; paste the URL or the JSON configuration value, not the whole CLI
   response. Organization administrators may need to enable CLI access before this route works.
3. In Cherry Studio → Plugins → DingTalk, paste one service URL, or combine up to three service
   entries under `mcpServers` as shown below. Preserve all URL query parameters and authorization
   headers from the export. Do not substitute a traditional AppKey/AppSecret or an app access token
   for a user-authorized MCP export.
4. Connect. Setup discovers tools without executing a business operation. The generic saved label
   “Official MCP” verifies neither a particular employee nor an organization identity.

```json
{
  "mcpServers": {
    "documents": { "type": "streamable-http", "url": "<official document MCP URL>" },
    "tasks": { "type": "streamable-http", "url": "<official task MCP URL>" },
    "calendar": { "type": "streamable-http", "url": "<official calendar MCP URL>" }
  }
}
```

Delete unused entries. The first release accepts only the official China gateway
`https://mcp-gw.dingtalk.com` and these service paths, published in official DWS source:

| Service | Path |
| --- | --- |
| Documents | `/server/91e17caf44f6ca1ed9c6ce614221a518ac93300ece63ca8d7e9b133f912e0607` |
| Tasks | `/server/0f51140eddcd913106c5821a4d0cd577b2d1a0b6cb452dd0e51ab41facf3a83c` |
| Calendar | `/server/3cb83d4ac411227c44c1abde4e4bfbae0ea2c172b83a78a33ffc3821d0d1be47` |

If the official export uses a different endpoint generation, it is not supported by this release;
do not rewrite a signed export to make it pass validation. Preserve it privately for local
compatibility work. This restriction excludes arbitrary third-party marketplace servers and the
international gateway. Optional `Authorization`, `x-user-access-token`, and `x-dingtalk-ext` headers
are accepted. Executable configurations and other headers/hosts are rejected.

## Credentials and eligibility

Users can arrange their own platform authorization, subject to organization policy. The traditional
OpenAPI route additionally requires a developer role and application permissions; it is distinct
from DWS user authorization and is not implemented here. This plugin does not require the open-source
app maintainer to hold a shared DingTalk application secret or host a relay.

Imported configurations may contain access credentials and remain in native secure storage. Never
include them in issues, source control, messages or logs. Disconnect before importing another
configuration. Local disconnect removes the local grant only; manage remote authorization in
DingTalk. Imported URLs/tokens are not auto-refreshed: when they expire, obtain a fresh official
export. All configured services must discover an admitted tool before setup succeeds.

Writes use the existing tool approval controls. Document updates may replace content, and task or
calendar writes may notify colleagues. Input schemas come from the service, not CLI shortcut flags.
The plugin does not silently retry a write with an unknown outcome; check the service first.

## Sources and acceptance

- [Official DWS repository](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli)
- [Pinned official service endpoints](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/8cacb01951d2567b2c0466d14cb6c5c9d0267a68/internal/syncdata/endpoints.go)
- [Official MCP URL export](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/8cacb01951d2567b2c0466d14cb6c5c9d0267a68/internal/app/mcp_url_command.go)
- [Document contracts](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/8cacb01951d2567b2c0466d14cb6c5c9d0267a68/internal/helpers/doc.go)
- [Task contracts](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/8cacb01951d2567b2c0466d14cb6c5c9d0267a68/internal/helpers/todo.go)
- [Calendar contracts](https://github.com/DingTalk-Real-AI/dingtalk-workspace-cli/blob/8cacb01951d2567b2c0466d14cb6c5c9d0267a68/internal/helpers/calendar.go)

No live user configuration was supplied. Export URL compatibility, expiry, administrator policy,
tool discovery and business operations require account acceptance before release. This implementation
does not claim that a real account was connected or any remote business operation was exercised.
