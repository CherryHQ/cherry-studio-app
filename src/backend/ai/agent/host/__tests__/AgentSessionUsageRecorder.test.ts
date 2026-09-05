import { AgentSessionUsageRecorder } from '../AgentSessionUsageRecorder';

describe('AgentSessionUsageRecorder', () => {
  test('attributes a turn to its Agent and Agent Session message', async () => {
    const recordInvocation = jest.fn(async () => undefined);
    const recorder = new AgentSessionUsageRecorder({
      usage: { recordInvocation },
    });

    recorder.record({
      agent: {
        disabledCapabilities: [],
        id: 'agent-1',
        instructions: '',
        model: { modelId: 'configured-model', providerId: 'provider-1' },
        name: 'Agent One',
        options: {},
        toolApprovalMode: 'default',
      },
      assistantMessageId: 'message-1',
      report: {
        completedAt: 1_500,
        context: {
          credentialReceipt: {
            attribution: 'explicit',
            id: 'credential-1',
            label: 'Primary',
            masked: 'sk-…1234',
          },
          modelId: 'served-model',
          modelName: 'Configured Model',
          pricingSnapshot: {
            capturedAt: '2026-08-25T00:00:00.000Z',
            currency: 'USD',
            inputPerMillionTokens: 2,
          },
          providerId: 'provider-1',
          providerName: 'Provider One',
          reportedCostCurrency: 'USD',
          trustProviderReportedCost: false,
        },
        usage: {
          cacheReadTokens: 3,
          cacheWriteTokens: 2,
          inputTokens: 10,
          noCacheTokens: 5,
          outputTokens: 5,
          reasoningTokens: 1,
          totalTokens: 15,
        },
      },
      turnId: 'turn-1',
    });
    await recorder.drain();

    expect(recordInvocation).toHaveBeenCalledWith({
      completedAt: 1_500,
      context: expect.objectContaining({
        messageRef: { id: 'message-1', kind: 'agent-session' },
        modelId: 'served-model',
        providerId: 'provider-1',
        credentialReceipt: {
          attribution: 'explicit',
          id: 'credential-1',
          label: 'Primary',
          masked: 'sk-…1234',
        },
        pricingSnapshot: expect.objectContaining({ inputPerMillionTokens: 2 }),
        source: { icon: null, id: 'agent-1', name: 'Agent One', type: 'agent' },
      }),
      modality: 'language',
      requestId: 'agent-session-turn:turn-1',
      usage: {
        cacheReadTokens: 3,
        cacheWriteTokens: 2,
        inputTokens: 10,
        noCacheTokens: 5,
        outputTokens: 5,
        reasoningTokens: 1,
        totalTokens: 15,
      },
    });
  });
});
