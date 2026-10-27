import type { Api, Model } from '@earendil-works/pi-ai';

import type { RuntimeExecutionRequest } from '../../types';
import {
  serializePiUserContent,
  serializePiPlainUserContent,
  toPiConversation,
} from '../modelMessages';

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

test.each([false, true])(
  'provenance maps interleaved authored UTF-16 ranges with images=%s',
  (withImage) => {
    const attachment = {
      type: 'text-attachment' as const,
      fileEntryId: 'file',
      mediaType: 'text/plain',
      name: 'body.txt',
      text: 'same body',
      truncated: false,
      trust: 'untrusted-user-content' as const,
    };
    const parts = [
      { type: 'text' as const, partId: 'first', text: 'same body' },
      attachment,
      ...(withImage ? [image] : []),
      { type: 'text' as const, partId: 'second', text: '😀 reference\nexpanded' },
      { type: 'text' as const, partId: 'empty', text: '' },
    ];
    const serialized = serializePiUserContent(parts, { image: true, video: false, audio: false });
    expect(serialized.layout?.contentKind).toBe(withImage ? 'blocks' : 'string');
    const texts = serialized.layout!.spans.map((span) => {
      const text =
        typeof serialized.content === 'string'
          ? serialized.content
          : (serialized.content['blockIndex' in span ? span.blockIndex : 0] as { text: string })
              .text;
      return text.slice(span.start, span.end);
    });
    expect(texts).toEqual(['same body', '😀 reference\nexpanded', '']);
    expect(serialized.layout!.spans.map((span) => span.partId)).toEqual([
      'first',
      'second',
      'empty',
    ]);
    expect(JSON.stringify(serialized.content)).toContain('managed-text-attachment');
  },
);

test('attachment-only provenance has an explicit stable empty slot and frozen image placeholders', () => {
  const serialized = serializePiUserContent(
    [{ type: 'text', text: '', partId: 'empty-display-slot' }, image],
    { image: true, video: false, audio: false },
  );
  expect(serialized.layout).toEqual({
    version: 1,
    renderer: 'runtime-user-text-v1',
    contentKind: 'blocks',
    spans: [{ partId: 'empty-display-slot', blockIndex: 0, start: 0, end: 0 }],
  });
  const plain = serializePiPlainUserContent(
    [{ partId: 'body', text: 'prompt' }],
    ['[Image input: image.png]'],
  );
  expect(plain).toEqual({
    content: 'prompt\n[Image input: image.png]',
    layout: {
      version: 1,
      renderer: 'plain-v1',
      contentKind: 'string',
      spans: [{ partId: 'body', start: 0, end: 6 }],
    },
  });
});
