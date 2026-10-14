import type { Api, Model } from '@earendil-works/pi-ai';

import type { RuntimeExecutionRequest } from '../../types';
import { toPiConversation } from '../modelMessages';

const model = { input: ['text', 'image'] } as unknown as Model<Api>;
const image = {
  type: 'file' as const,
  fileEntryId: '00000000-0000-7000-8000-000000000001',
  mediaType: 'image/png',
  name: 'chart.png',
  uri: 'data:image/png;base64,cGl4ZWxz',
};

function request(overrides: Partial<RuntimeExecutionRequest>): RuntimeExecutionRequest {
  return {
    turnId: 'turn',
    sessionId: 'session',
    instructions: '',
    model: { providerId: 'provider', modelId: 'model' } as RuntimeExecutionRequest['model'],
    history: [],
    contextCheckpoint: null,
    input: [],
    tools: [],
    options: {} as RuntimeExecutionRequest['options'],
    ...overrides,
  };
}

test('an attached image names its managed file, in the prompt and in rebuilt history', () => {
  const label = {
    type: 'text',
    text: 'Cherry managed image: {"fileEntryId":"00000000-0000-7000-8000-000000000001","name":"chart.png"}',
  };
  const pixels = { type: 'image', data: 'cGl4ZWxz', mimeType: 'image/png' };
  const conversation = toPiConversation(
    request({
      history: [{ turnId: 'earlier', messages: [{ role: 'user', parts: [image] }] }],
      input: [{ type: 'text', text: 'Compare them.' }, image],
    }),
    model,
  );
  // read_file needs the id once compaction or a rebuild has dropped the pixels.
  expect(conversation.prompt.content).toEqual([
    { type: 'text', text: 'Compare them.' },
    label,
    pixels,
  ]);
  expect(conversation.history[0]).toMatchObject({ role: 'user', content: [label, pixels] });
});
