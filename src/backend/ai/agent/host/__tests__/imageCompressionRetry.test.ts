import type { RuntimeEvent, RuntimeExecutionRequest } from '../../runtime';
import { executeWithImageCompressionRetry } from '../imageCompressionRetry';

const request: RuntimeExecutionRequest = {
  turnId: 'turn-1',
  sessionId: 'session-1',
  instructions: '',
  model: { providerId: 'provider', modelId: 'model' },
  history: [],
  contextCheckpoint: null,
  input: [{ type: 'file', mediaType: 'image/png', uri: 'data:image/png;base64,ORIGINAL' }],
  tools: [],
  options: {},
};
const smaller: RuntimeExecutionRequest = {
  ...request,
  input: [{ type: 'file', mediaType: 'image/png', uri: 'data:image/png;base64,SMALL' }],
};
const tooLarge: RuntimeEvent = {
  type: 'failed',
  error: {
    code: 'api_error',
    message: 'Request too large',
    retryable: false,
    context: { statusCode: 413 },
  },
};
const completed: RuntimeEvent = { type: 'completed' };

async function* events(values: RuntimeEvent[]) {
  yield* values;
}

async function collect(stream: AsyncIterable<RuntimeEvent>) {
  const result: RuntimeEvent[] = [];
  for await (const event of stream) result.push(event);
  return result;
}

function setup(first: RuntimeEvent[], second: RuntimeEvent[] = [completed]) {
  const execute = jest.fn((_request: RuntimeExecutionRequest) => events(first));
  execute.mockImplementationOnce(() => events(first)).mockImplementationOnce(() => events(second));
  return {
    session: { execute },
    request,
    prepareRetry: jest.fn(async (): Promise<RuntimeExecutionRequest | undefined> => smaller),
    signal: new AbortController().signal,
  };
}

describe('image compression retry', () => {
  test('keeps successful original requests untouched', async () => {
    const input = setup([completed]);
    expect(await collect(executeWithImageCompressionRetry(input))).toEqual([completed]);
    expect(input.prepareRetry).not.toHaveBeenCalled();
    expect(input.session.execute).toHaveBeenCalledTimes(1);
    expect(input.session.execute).toHaveBeenCalledWith(request);
  });

  test('retries a size rejection once without exposing the first failure', async () => {
    const input = setup([tooLarge]);
    expect(await collect(executeWithImageCompressionRetry(input))).toEqual([completed]);
    expect(input.session.execute).toHaveBeenNthCalledWith(1, request);
    expect(input.session.execute).toHaveBeenNthCalledWith(2, smaller);
    expect(input.prepareRetry).toHaveBeenCalledTimes(1);
  });

  test('exposes the second failure instead of retrying indefinitely', async () => {
    const input = setup([tooLarge], [tooLarge]);
    expect(await collect(executeWithImageCompressionRetry(input))).toEqual([tooLarge]);
    expect(input.session.execute).toHaveBeenCalledTimes(2);
    expect(input.prepareRetry).toHaveBeenCalledTimes(1);
  });

  test.each(['Invalid API key', 'Connection error', 'maximum context length exceeded'])(
    'does not compress for %s',
    async (message) => {
      const failed: RuntimeEvent = {
        type: 'failed',
        error: { code: 'api_error', message, retryable: true },
      };
      const input = setup([failed]);
      expect(await collect(executeWithImageCompressionRetry(input))).toEqual([failed]);
      expect(input.prepareRetry).not.toHaveBeenCalled();
    },
  );

  test.each<RuntimeEvent>([
    { type: 'text.delta', partId: 'text-1', text: 'Partial output' },
    {
      type: 'part.add',
      index: 0,
      part: {
        id: 'tool-1',
        type: 'tool',
        toolCallId: 'call-1',
        toolRef: { source: 'builtin', capabilityId: 'write' },
        providerName: 'write',
        displayName: 'Write',
        state: 'running',
        input: {},
      },
    },
  ])('never replays a turn after %s', async (partial) => {
    const input = setup([partial, tooLarge]);
    expect(await collect(executeWithImageCompressionRetry(input))).toEqual([partial, tooLarge]);
    expect(input.prepareRetry).not.toHaveBeenCalled();
  });

  test.each(['unchanged', 'failed'])(
    'keeps the original error when compression is %s',
    async (outcome) => {
      const input = setup([tooLarge]);
      if (outcome === 'unchanged') input.prepareRetry.mockResolvedValue(undefined);
      else input.prepareRetry.mockRejectedValue(new Error('Cannot decode image'));
      expect(await collect(executeWithImageCompressionRetry(input))).toEqual([tooLarge]);
      expect(input.session.execute).toHaveBeenCalledTimes(1);
    },
  );

  test('cancellation during compression prevents the retry', async () => {
    const controller = new AbortController();
    const input = setup([tooLarge]);
    input.signal = controller.signal;
    input.prepareRetry.mockImplementation(async () => {
      controller.abort(new Error('Cancelled'));
      return smaller;
    });
    await expect(collect(executeWithImageCompressionRetry(input))).rejects.toThrow('Cancelled');
    expect(input.session.execute).toHaveBeenCalledTimes(1);
  });
});
