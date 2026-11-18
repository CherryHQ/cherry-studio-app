import type { Api, Message, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import { FileEntryIdSchema } from '@/shared/data/types/file';

import { withPiDeepseekFiles, type PiDeepseekDocumentUpload } from '../piDeepseekFiles';
import type { PiStreamFn } from '../piModelTypes';
import type { PiProviderDocument } from '../piProviderDocument';

const FILE_ID = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001');
const ATTACHMENT_TEXT = 'Managed PDF: report.pdf';
const upload = jest.fn<
  ReturnType<PiDeepseekDocumentUpload>,
  Parameters<PiDeepseekDocumentUpload>
>();
const model = {
  api: 'openai-completions',
  provider: 'deepseek',
  id: 'deepseek-flash',
} as Model<Api>;

function document(revision: number): Message {
  const part: PiProviderDocument = {
    type: 'text',
    text: ATTACHMENT_TEXT,
    cherryProviderDocument: { fileEntryId: FILE_ID, revision, mediaType: 'application/pdf' },
  };
  return { role: 'user', content: [part], timestamp: revision };
}

async function request(messages: Message[]) {
  let sent: unknown;
  const stream: PiStreamFn = async (wire, context, options) => {
    const payload = {
      messages: context.messages.map(({ role, content }) => ({
        role,
        content:
          typeof content === 'string'
            ? content
            : content.map((part) =>
                part.type === 'text' ? { type: 'text', text: part.text } : part,
              ),
      })),
    };
    sent = await options?.onPayload?.(payload, wire);
    return new AssistantMessageEventStream();
  };
  await withPiDeepseekFiles(stream, upload)(model, normalizeContext({ messages }));
  return sent;
}

beforeEach(() => {
  upload.mockReset();
});

test('continues a text turn when an older local document is unavailable', async () => {
  upload.mockResolvedValue(null);
  const prompt = `What was the title? ${ATTACHMENT_TEXT}`;
  await expect(
    request([document(1), { role: 'user', content: prompt, timestamp: 2 }]),
  ).resolves.toEqual({
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: expect.stringContaining('no longer available') }],
      },
      { role: 'user', content: prompt },
    ],
  });
});

test('sends the reattached revision without treating the old identical envelope as current', async () => {
  upload.mockImplementation(async (input) => (input.revision === 1 ? null : 'file-current'));
  await expect(request([document(1), document(2)])).resolves.toEqual({
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text: expect.stringContaining('no longer available') }],
      },
      {
        role: 'user',
        content: [
          { type: 'file', file_id: 'file-current' },
          { type: 'text', text: ATTACHMENT_TEXT },
        ],
      },
    ],
  });
});

test('keeps the newest documents native and points older ones to read_file past the limit', async () => {
  upload.mockImplementation(async (input) => `file-${input.revision}`);
  const sent = (await request(Array.from({ length: 22 }, (_, index) => document(index + 1)))) as {
    messages: { content: { type: string; file_id?: string; text?: string }[] }[];
  };
  expect(upload).toHaveBeenCalledTimes(20);
  expect(sent.messages[0]?.content).toEqual([
    { type: 'text', text: expect.stringContaining('read_file') },
  ]);
  expect(sent.messages[1]?.content).toEqual([
    { type: 'text', text: expect.stringContaining('read_file') },
  ]);
  expect(sent.messages[2]?.content[0]).toEqual({ type: 'file', file_id: 'file-3' });
  expect(sent.messages[21]?.content[0]).toEqual({ type: 'file', file_id: 'file-22' });
});

test('marks only the latest user message as current and propagates upload failures', async () => {
  upload.mockResolvedValue('file-1');
  await request([document(1), { role: 'user', content: 'Continue', timestamp: 2 }]);
  expect(upload.mock.calls[0]?.[0].isCurrent).toBe(false);
  await request([document(1)]);
  expect(upload.mock.calls[1]?.[0].isCurrent).toBe(true);
  const transport = new Error('Provider unavailable');
  upload.mockRejectedValueOnce(transport);
  await expect(
    request([document(1), { role: 'user', content: 'Continue', timestamp: 2 }]),
  ).rejects.toBe(transport);
});
