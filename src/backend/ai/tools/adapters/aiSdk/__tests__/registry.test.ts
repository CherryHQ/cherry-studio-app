import type { Tool } from 'ai';

import { ToolRegistry } from '../registry';
import type { ToolApplyScope, ToolEntry } from '../types';

const scope = {
  deviceAccess: {},
  externalWebSearchEnabled: false,
  platform: 'ios',
} as ToolApplyScope;

function entry(name: string, overrides: Partial<ToolEntry> = {}): ToolEntry {
  return {
    defer: 'never',
    description: `${name} description`,
    name,
    namespace: 'test',
    tool: { inputSchema: {} } as Tool,
    ...overrides,
  };
}

describe('ToolRegistry', () => {
  test('registers, sorts, filters, and groups entries deterministically', () => {
    const registry = new ToolRegistry();
    registry.register(entry('web_search', { namespace: 'web' }));
    registry.register(entry('calendar_list_events', { namespace: 'calendar' }));
    registry.register(entry('web_fetch', { namespace: 'web' }));

    expect(registry.getAll().map((item) => item.name)).toEqual([
      'calendar_list_events',
      'web_fetch',
      'web_search',
    ]);
    expect(registry.getAll({ namespace: 'web' }).map((item) => item.name)).toEqual([
      'web_fetch',
      'web_search',
    ]);
    expect(registry.getAll({ query: 'calendar' }).map((item) => item.name)).toEqual([
      'calendar_list_events',
    ]);
    expect([...registry.getByNamespace().keys()]).toEqual(['calendar', 'web']);
  });

  test('rejects duplicate wire names', () => {
    const registry = new ToolRegistry();
    registry.register(entry('same'));
    expect(() => registry.register(entry('same'))).toThrow('already registered');
  });

  test('filters and materializes request-scoped entries without mutating the catalog', () => {
    const registry = new ToolRegistry();
    const requestTool = { description: 'request', inputSchema: {} } as Tool;
    registry.register(entry('hidden', { applies: () => false }));
    registry.register(entry('dynamic', { buildTool: () => requestTool }));

    expect(registry.selectActive(scope).map((item) => item.name)).toEqual(['dynamic']);
    expect(registry.selectActive(scope)[0].tool).toBe(requestTool);
    expect(registry.getByName('dynamic')?.tool).not.toBe(requestTool);
  });

  test('treats throwing predicates and builders as inactive', () => {
    const registry = new ToolRegistry();
    registry.register(entry('good'));
    registry.register(
      entry('predicate', {
        applies: () => {
          throw new Error('no');
        },
      }),
    );
    registry.register(
      entry('builder', {
        buildTool: () => {
          throw new Error('no');
        },
      }),
    );

    expect(registry.selectActive(scope).map((item) => item.name)).toEqual(['good']);
  });
});
