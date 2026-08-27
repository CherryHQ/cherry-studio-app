import { AgentInferenceSnapshotV1Schema } from '@/shared/contracts/agent';

import type { RuntimeTool } from '../../runtime';
import { createAgentInferenceSnapshot } from '../inferenceSnapshot';

describe('Agent inference snapshots', () => {
  test('copies only request identity, parameters, and the frozen tool policy', () => {
    const tool: RuntimeTool = {
      ref: { source: 'mcp', serverId: 'server-1', rawToolName: 'search' },
      providerName: 'mcp_server_1_search_a1b2',
      displayName: 'Search',
      description: 'https://mcp.example.test with credential-secret',
      inputSchema: {
        type: 'object',
        headers: { authorization: 'Bearer credential-secret' },
        example: 'data:image/png;base64,private-data',
        path: '/Users/example/private.txt',
      },
      approval: 'ask',
      execute: async () => ({ value: null, artifacts: [] }),
    };

    const snapshot = createAgentInferenceSnapshot({
      model: {
        uniqueModelId: 'provider-1::model-1',
        providerId: 'provider-1',
        modelId: 'model-1',
        apiModelId: 'served-model-1',
        name: 'Model One',
      },
      options: { reasoningEffort: 'high', temperature: 0.2, maxOutputTokens: 2048 },
      tools: [tool],
    });

    expect(snapshot).toEqual({
      version: 1,
      model: {
        uniqueModelId: 'provider-1::model-1',
        providerId: 'provider-1',
        modelId: 'model-1',
        apiModelId: 'served-model-1',
        name: 'Model One',
      },
      reasoningEffort: 'high',
      parameters: { temperature: 0.2, maxOutputTokens: 2048 },
      tools: [
        {
          ref: { source: 'mcp', serverId: 'server-1', rawToolName: 'search' },
          providerName: 'mcp_server_1_search_a1b2',
          displayName: 'Search',
          approval: 'ask',
        },
      ],
    });
    expect(AgentInferenceSnapshotV1Schema.parse(JSON.parse(JSON.stringify(snapshot)))).toEqual(
      snapshot,
    );

    const serialized = JSON.stringify(snapshot);
    for (const forbidden of [
      'credential-secret',
      'https://',
      'authorization',
      'data:image',
      '/Users/',
      'inputSchema',
      'execute',
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  test('records an explicit empty tool catalog without stale fields', () => {
    expect(
      createAgentInferenceSnapshot({
        model: {
          uniqueModelId: 'provider-1::model-1',
          providerId: 'provider-1',
          modelId: 'model-1',
          name: 'Model One',
        },
        options: {},
        tools: [],
      }),
    ).toEqual({
      version: 1,
      model: {
        uniqueModelId: 'provider-1::model-1',
        providerId: 'provider-1',
        modelId: 'model-1',
        name: 'Model One',
      },
      parameters: {},
      tools: [],
    });
  });
});
