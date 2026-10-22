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

  test.each(['pi-durable', 'pi-codemode'])(
    'pins the %s patch to the installed dependency',
    (name) => {
      const path = `patches/@earendil-works__${name}@1.4.0.patch`;
      const hash = createHash('sha256').update(readFileSync(path)).digest('hex');
      expect(readFileSync('pnpm-workspace.yaml', 'utf8')).toContain(
        `'@earendil-works/${name}@1.4.0': ${path}`,
      );
      expect(readFileSync('pnpm-lock.yaml', 'utf8')).toContain(
        `  '@earendil-works/${name}@1.4.0': ${hash}\n`,
      );
    },
  );
});
