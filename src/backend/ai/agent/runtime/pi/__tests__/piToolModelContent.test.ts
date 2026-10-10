import { AgentToolResultSchema } from '@/shared/contracts/agent';

import { piToolModelContent, persistentToolResult } from '../piToolModelContent';

const fileEntryId = '00000000-0000-4000-8000-000000000001';
const output = {
  value: { content: [{ type: 'text', text: 'summary' }], _meta: { privateState: 'ui-only' } },
  artifacts: [],
  modelContent: [{ type: 'image' as const, fileEntryId, mimeType: 'image/png' as const }],
  modelImages: [{ fileEntryId, mimeType: 'image/png', data: 'aGVsbG8=' }],
};

describe('MCP model and persisted result channels', () => {
  it('sends temporary image bytes to image-capable models without persisting those bytes', () => {
    expect(piToolModelContent(output, true)).toEqual([
      { type: 'image', mimeType: 'image/png', data: 'aGVsbG8=' },
    ]);
    const stored = persistentToolResult(output);
    expect(AgentToolResultSchema.parse(stored).modelContent).toEqual(output.modelContent);
    expect(JSON.stringify(stored)).not.toContain('aGVsbG8=');
    expect(piToolModelContent(stored, true)).toEqual([
      { type: 'text', text: `[MCP image attachment: ${fileEntryId}]` },
    ]);
    expect(piToolModelContent(output, true, false).every((block) => block.type === 'text')).toBe(
      true,
    );
  });

  it('projects older raw MCP envelopes without leaking UI metadata into model history', () => {
    expect(piToolModelContent({ value: output.value, artifacts: [] }, true)).toEqual([
      { type: 'text', text: 'summary' },
    ]);
  });
});
