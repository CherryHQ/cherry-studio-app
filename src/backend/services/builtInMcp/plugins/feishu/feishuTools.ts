import type { PluginToolPolicy } from '../../pluginDefinition';
import type { FeishuToolAccess } from './feishuApiTool';
import { feishuBaseTools } from './feishuBaseTools';
import { feishuCalendarTools } from './feishuCalendarTools';
import { feishuTaskTools } from './feishuTaskTools';

const documentWriteScopes = [
  'docx:document:create',
  'wiki:node:read',
  'wiki:node:create',
  'docs:document.media:upload',
  'board:whiteboard:node:create',
  'docx:document:write_only',
  'docx:document:readonly',
];

// Official hosted tools keep their upstream names and discover their schemas remotely.
// Attachment transfer, including fetch-file, is outside the Feishu plugin's product scope.
export const FEISHU_REMOTE_TOOLS = {
  'fetch-doc': {
    access: 'read',
    scopes: ['docx:document:readonly', 'task:task:read', 'im:chat:read'],
  },
  'list-docs': { access: 'read', scopes: ['wiki:wiki:readonly'] },
  'get-comments': {
    access: 'read',
    scopes: ['docs:document.comment:read', 'contact:contact.base:readonly'],
  },
  'create-doc': { access: 'write', scopes: documentWriteScopes },
  'update-doc': { access: 'write', scopes: documentWriteScopes },
  'add-comments': { access: 'write', scopes: ['docs:document.comment:create'] },
  'search-doc': { access: 'read', scopes: ['search:docs:read', 'wiki:wiki:readonly'] },
  'search-user': { access: 'read', scopes: ['contact:user:search'] },
  'get-user': {
    access: 'read',
    scopes: ['contact:contact.base:readonly', 'contact:user.base:readonly'],
  },
} as const satisfies Record<string, { access: FeishuToolAccess; scopes: readonly string[] }>;

export const FEISHU_API_TOOLS = new Map(
  [...feishuBaseTools, ...feishuTaskTools, ...feishuCalendarTools].map((tool) => [
    tool.definition.name,
    tool,
  ]),
);
export const FEISHU_REMOTE_TOOL_POLICY: PluginToolPolicy = Object.fromEntries(
  Object.entries(FEISHU_REMOTE_TOOLS).map(([name, tool]) => [name, tool.access]),
);
export const FEISHU_TOOL_POLICY: PluginToolPolicy = {
  ...FEISHU_REMOTE_TOOL_POLICY,
  ...Object.fromEntries([...FEISHU_API_TOOLS].map(([name, tool]) => [name, tool.access])),
};
export const FEISHU_REQUIRED_SCOPES = [
  ...new Set([
    ...Object.values(FEISHU_REMOTE_TOOLS).flatMap((tool) => [...tool.scopes]),
    ...[...FEISHU_API_TOOLS.values()].flatMap((tool) => tool.scopes),
  ]),
];
