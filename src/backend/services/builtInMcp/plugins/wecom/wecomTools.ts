import type { PluginToolPolicy } from '../../pluginDefinition';

// Official non-file command paths from WecomTeam/wecom-cli at
// 1cd90a5337ce11ffbcf14c5ad2e85e6ee97c8b08. Effects are owned locally, never by discovery.
export const WECOM_SERVICES = {
  identity: { whoami: 'read' },
  contact: { 'users search': 'read' },
  doc: {
    create: 'write',
    search: 'read',
    'contents get': 'read',
    'contents append': 'write',
    'contents overwrite': 'write',
    'names update': 'write',
    'members update': 'write',
    'rules update': 'write',
  },
  smartpage: {
    create: 'write',
    'pages get': 'read',
    'pages update': 'write',
    'blocks update': 'write',
    'databases get': 'read',
  },
  sheet: {
    create: 'write',
    get: 'read',
    'ranges get': 'read',
    'contents update': 'write',
    'rows append': 'write',
    'subsheets add': 'write',
    'subsheets delete': 'write',
  },
  smartsheet: {
    create: 'write',
    get: 'read',
    'sheets list': 'read',
    'sheets add': 'write',
    'sheets update': 'write',
    'sheets delete': 'write',
    'fields list': 'read',
    'fields add': 'write',
    'fields update': 'write',
    'fields delete': 'write',
    'records list': 'read',
    'records query': 'read',
    'records add': 'write',
    'records update': 'write',
    'records delete': 'write',
    'views list': 'read',
    'views add': 'write',
    'views update': 'write',
    'views delete': 'write',
    'charts list': 'read',
    'charts add': 'write',
    'charts update': 'write',
    'charts delete': 'write',
  },
  todo: {
    list: 'read',
    get: 'read',
    create: 'write',
    update: 'write',
    finish: 'write',
    delete: 'write',
  },
  calendar: {
    'schedules list': 'read',
    'schedules get': 'read',
    'schedules search': 'read',
    'schedules create': 'write',
    'schedules update': 'write',
    'schedules cancel': 'write',
    'schedules free list': 'read',
  },
  meeting: {
    list: 'read',
    get: 'read',
    search: 'read',
    'original get': 'read',
    'rooms buildings list': 'read',
    'rooms search': 'read',
    create: 'write',
    update: 'write',
    cancel: 'write',
  },
  mail: { search: 'read', get: 'read', send: 'write' },
  message: { 'aibot sessions list': 'read', 'aibot send': 'write' },
} satisfies Record<string, PluginToolPolicy>;

export const WECOM_BOT_METHODS = Object.fromEntries(
  Object.entries(WECOM_SERVICES).flatMap(([service, methods]) =>
    Object.entries(methods).map(([method, effect]) => {
      const path = [service, ...method.split(' ')];
      return [`wecom_${path.join('_')}`, { path, effect }];
    }),
  ),
) as Record<string, { path: string[]; effect: 'read' | 'write' }>;

export const WECOM_TOOL_POLICY: PluginToolPolicy = Object.fromEntries(
  Object.entries(WECOM_BOT_METHODS).map(([name, method]) => [name, method.effect]),
);
