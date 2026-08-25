import { AgentSessionUsageRecorder } from '../AgentSessionUsageRecorder';

describe('AgentSessionUsageRecorder', () => {
  test('attributes a turn to its Agent and Agent Session message', async () => {
    const recordInvocation = jest.fn(async () => undefined);
    const recorder = new AgentSessionUsageRecorder({
      model: {
        getById: jest.fn(async () => ({
          apiModelId: 'served-model',
          modelId: 'configured-model',
          name: 'Configured Model',
          pricing: undefined,
        })),
      },
      provider: {
        getByProviderId: jest.fn(async () => ({
          apiFeatures: { reportsActualCost: false },
          id: 'provider-1',
          name: 'Provider One',
          reportedCostCurrency: undefined,
        })),
      },
      usage: { recordInvocation },
    } as never);

    recorder.record({
      agent: {
        id: 'agent-1',
        instructions: '',
        model: { modelId: 'configured-model', providerId: 'provider-1' },
        name: 'Agent One',
        options: {},
      },
      assistantMessageId: 'message-1',
      completedAt: 1_500,
      startedAt: 1_000,
      turnId: 'turn-1',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
    await recorder.drain();

    expect(recordInvocation).toHaveBeenCalledWith({
      completedAt: 1_500,
      context: expect.objectContaining({
        messageRef: { id: 'message-1', kind: 'agent-session' },
        modelId: 'served-model',
        providerId: 'provider-1',
        source: { icon: null, id: 'agent-1', name: 'Agent One', type: 'agent' },
      }),
      metrics: { timeCompletionMs: 500 },
      modality: 'language',
      requestId: 'agent-session-turn:turn-1',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    });
  });
});
