import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { BACKGROUND_CONTEXT } from '@earendil-works/chord/context';
import type { ToolExecutionApi } from '@earendil-works/pi-durable';
import { createToolSearchTool } from '@earendil-works/pi-durable/tool-search';

const catalog = [
  { name: 'mcp_calendar', description: '飞书日历', parameters: { type: 'object' } },
  { name: 'mcp_mail', description: '飞书邮件', parameters: { type: 'object' } },
  { name: 'mcp_github', description: 'Search GitHub issues', parameters: { type: 'object' } },
];

describe('upstream tool discovery', () => {
  test.each([
    ['日历', ['mcp_calendar']],
    ['飞书', ['mcp_calendar', 'mcp_mail']],
    ['issue', ['mcp_github']],
  ])('loads tools for %s through the native discovery control', async (query, expected) => {
    const api = { agent: async () => ({ deferred: catalog }) } as unknown as ToolExecutionApi;
    const result = await createToolSearchTool().execute({ query }, api, BACKGROUND_CONTEXT);
    expect(result.control?.addTools).toEqual(expected);
  });

  test('loads exact deferred names before ranked matches, so a small limit cannot load another tool', async () => {
    // BM25 ranks the shorter agent_get first for "agent_list": it mentions the name and is shorter.
    const agents = [
      { name: 'agent_get', description: 'Read one Agent by an id from agent_list.' },
      {
        name: 'agent_list',
        description:
          'List saved Agents with their names, models, capabilities, approval modes, skill bindings and update times, newest first, one page at a time.',
      },
      { name: 'agent_update', description: 'Change fields of one Agent.' },
    ].map((tool) => ({ ...tool, parameters: { type: 'object' } }));
    const api = { agent: async () => ({ deferred: agents }) } as unknown as ToolExecutionApi;
    const search = (query: string, limit: number) =>
      createToolSearchTool().execute({ query, limit }, api, BACKGROUND_CONTEXT);

    expect((await search('agent_list', 1)).control?.addTools).toEqual(['agent_list']);
    expect((await search('agent_update, agent_list', 1)).control?.addTools).toEqual([
      'agent_update',
      'agent_list',
    ]);
    expect((await search('list agents', 1)).control?.addTools).toHaveLength(1);
  });

  test.each(['pi-durable', 'pi-codemode'])(
    'pins the %s patch to the installed dependency',
    (name) => {
      const path = `patches/@earendil-works__${name}@1.3.0.patch`;
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
      expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(
        `'@earendil-works/${name}@1.3.0': ${path}`,
      );
      expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
        `  '@earendil-works/${name}@1.3.0': ${hash}\n`,
      );
    },
  );
});
