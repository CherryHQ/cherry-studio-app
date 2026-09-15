import type { PluginToolPolicy } from '../../pluginDefinition';

// Reviewed against official CLI 1.2.1 skills at 1cd90a5337ce11ffbcf14c5ad2e85e6ee97c8b08.
// New service/resource/method paths are admitted with write approval.
const READ_TOOLS = {
  calendar: ['schedules__free__list', 'schedules__get', 'schedules__list', 'schedules__search'],
  contact: ['users__search'],
  disk: ['files__get', 'files__list', 'files__search'],
  doc: ['contents__get', 'search'],
  identity: ['whoami'],
  mail: ['get', 'search'],
  meeting: ['get', 'list', 'original__get', 'rooms__buildings__list', 'rooms__search', 'search'],
  message: ['aibot__sessions__list'],
  sheet: ['get', 'ranges__get'],
  smartpage: ['databases__get', 'pages__get'],
  smartsheet: [
    'charts__list',
    'fields__list',
    'records__list',
    'records__query',
    'sheets__list',
    'views__list',
  ],
  todo: ['get', 'list'],
} as const;

export const WECOM_TOOL_POLICY: PluginToolPolicy = Object.fromEntries(
  Object.entries(READ_TOOLS).flatMap(([service, methods]) =>
    methods.map((name) => [`wecom_${service}__${name}`, 'read']),
  ),
);

export function acceptsWecomTool(name: string): boolean {
  return name.length <= 128 && /^wecom_[a-zA-Z][a-zA-Z0-9_-]*__[a-zA-Z][a-zA-Z0-9_-]*$/.test(name);
}

export function getWecomToolEffect(name: string): 'read' | 'write' | undefined {
  if (!acceptsWecomTool(name)) return undefined;
  return Object.hasOwn(WECOM_TOOL_POLICY, name) ? WECOM_TOOL_POLICY[name] : 'write';
}
