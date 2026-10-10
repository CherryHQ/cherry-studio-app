import type { Api, Context, Model, ToolResultMessage } from '@earendil-works/pi-ai';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import { imageModelStream, PI_IMAGE_TOOL_NAME } from '../piDurableImageModel';

const model: Model<Api> = {
  api: 'cherry-image',
  provider: 'provider',
  id: 'image',
  name: 'Image',
  baseUrl: '',
  contextWindow: Number.MAX_SAFE_INTEGER,
  maxTokens: 1,
  input: ['text'],
  reasoning: false,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
};
const user = { role: 'user' as const, content: 'Draw a cat.', timestamp: 1 };
const result: ToolResultMessage = {
  role: 'toolResult',
  toolCallId: 'image-call',
  toolName: PI_IMAGE_TOOL_NAME,
  content: [{ type: 'text', text: 'Saved image.' }],
  isError: false,
  timestamp: 2,
};

const stream = (context: Context) => imageModelStream(model, normalizeContext(context));

describe('Pi direct image scheduling', () => {
  test('admits one image capability and stops after its confirmed result', async () => {
    const first = await stream({ messages: [user] }).result();
    expect(first.stopReason).toBe('toolUse');
    expect(first.content).toEqual([
      expect.objectContaining({ type: 'toolCall', name: PI_IMAGE_TOOL_NAME }),
    ]);
    const complete = await stream({ messages: [user, result] }).result();
    expect(complete).toMatchObject({ stopReason: 'stop', content: [] });
  });

  test('an uncertain or failed result ends with an error rather than repeating the effect', async () => {
    const complete = await stream({
      messages: [user, { ...result, isError: true }],
    }).result();
    expect(complete).toMatchObject({ stopReason: 'error', content: [] });
  });

  test('a previous turn image does not satisfy a new user request', async () => {
    const next = await stream({
      messages: [user, result, { ...user, timestamp: 3 }],
    }).result();
    expect(next.stopReason).toBe('toolUse');
  });
});
