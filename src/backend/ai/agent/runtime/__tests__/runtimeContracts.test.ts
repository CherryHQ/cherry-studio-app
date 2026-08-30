import { RuntimeContextCheckpointSchema } from '../runtimeSchemas';
import type {
  RuntimeArtifact,
  RuntimeContextCheckpoint,
  RuntimeMessageToolRef,
  RuntimeTool,
  RuntimeToolRef,
  RuntimeToolResult,
} from '../types';

describe('Agent Runtime settled contracts', () => {
  test('round-trips stable refs, results, and managed artifacts as JSON', async () => {
    const ref: RuntimeToolRef = {
      source: 'mcp',
      serverId: 'server-1',
      rawToolName: 'search',
    };
    const artifact: RuntimeArtifact = {
      ref: { kind: 'managed-file', fileEntryId: 'file-1' },
      mediaType: 'text/markdown',
      name: 'result.md',
      kind: 'created',
    };
    const expected: RuntimeToolResult = {
      value: { matches: 2 },
      artifacts: [artifact],
    };
    const tool: RuntimeTool = {
      ref,
      providerName: 'mcp_server_1_search_a1b2',
      displayName: 'Search',
      description: 'Search documents.',
      inputSchema: { type: 'object' },
      approval: 'ask',
      execute: async () => expected,
    };

    const result = await tool.execute({
      input: { query: 'Cherry Studio' },
      signal: new AbortController().signal,
      toolCallId: 'call-1',
    });

    expect(JSON.parse(JSON.stringify({ ref, result }))).toEqual({ ref, result: expected });
  });

  test('keeps meta activity distinct from executable tool refs', () => {
    const ref: RuntimeMessageToolRef = { source: 'meta', name: 'tool_search' };

    expect(JSON.parse(JSON.stringify(ref))).toEqual(ref);
  });

  test('round-trips context checkpoints through the Runtime schema', () => {
    const checkpoint: RuntimeContextCheckpoint = {
      version: 1,
      anchorTurnId: 'turn-1',
      payload: { summary: 'Earlier conversation.', retained: ['fact-1'] },
    };

    expect(RuntimeContextCheckpointSchema.parse(JSON.parse(JSON.stringify(checkpoint)))).toEqual(
      checkpoint,
    );
  });
});
