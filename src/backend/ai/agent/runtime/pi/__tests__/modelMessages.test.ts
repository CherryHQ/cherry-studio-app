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

test('an image omitted for a text-only model still names its managed file', () => {
  const conversation = toPiConversation(request({ input: [image] }), {
    input: ['text'],
  } as unknown as Model<Api>);
  // generate_image reads the original by id even when the chat model cannot see the pixels.
  expect(conversation.prompt.content).toBe(
    '[image attachment omitted: this model does not accept image input] Cherry managed file: {"fileEntryId":"00000000-0000-7000-8000-000000000001","name":"chart.png"}',
  );
});

test('OCR content is visible to non-tool text models with an explicit image-reading limitation', () => {
  const conversation = toPiConversation(
    request({
      input: [
        {
          type: 'text-attachment',
          fileEntryId: image.fileEntryId!,
          name: 'receipt.png',
          mediaType: 'image/png',
          trust: 'untrusted-user-content',
          text: 'Total: 42',
          truncated: false,
          attachmentReport: {
            mode: 'image-text',
            parser: 'native-image-ocr',
            sourceTruncated: false,
            requestTruncated: false,
          },
        },
      ],
    }),
    { input: ['text'] } as unknown as Model<Api>,
  );
  expect(typeof conversation.prompt.content).toBe('string');
  expect(conversation.prompt.content).toContain('Total: 42');
  expect(conversation.prompt.content).toContain('native-image-ocr');
  expect(conversation.prompt.content).toContain('has not received image pixels');
  expect(conversation.prompt.content).not.toContain('attachment omitted');
});
