import type { Api, Message, Model } from '@earendil-works/pi-ai';
import { AssistantMessageEventStream } from '@earendil-works/pi-ai/utils/event-stream';
import { normalizeContext } from '@earendil-works/pi-ai/utils/transcript';

import {
  DeepseekDocumentUnavailableError,
  uploadDeepseekDocument,
} from '@/backend/services/file/deepseekFiles';
import { FileEntryIdSchema } from '@/shared/data/types/file';

import { withPiDeepseekFiles } from '../piDeepseekFiles';
import type { PiStreamFn } from '../piModelTypes';
import type { PiProviderDocument } from '../piProviderDocument';

jest.mock('@/backend/services/file/deepseekFiles', () => ({
  DeepseekDocumentUnavailableError: class DeepseekDocumentUnavailableError extends Error {},
  uploadDeepseekDocument: jest.fn(),
}));
jest.mock('@/backend/services/providers/deepseekConnection', () => ({
  createDeepseekConnection: jest.fn(),
}));

const FILE_ID = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001');
const ATTACHMENT_TEXT = 'Managed PDF: report.pdf';
const upload = jest.mocked(uploadDeepseekDocument);
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
  await withPiDeepseekFiles(
    stream,
    'deepseek',
    'test-key',
    'https://api.deepseek.test',
  )(model, normalizeContext({ messages }));
  return sent;
}

beforeEach(() => {
  upload.mockReset();
});

test('continues a text turn when an older local document is unavailable', async () => {
  upload.mockRejectedValue(new DeepseekDocumentUnavailableError());
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
  upload.mockImplementation(async (_connection, input) => {
    if (input.revision === 1) throw new DeepseekDocumentUnavailableError();
    return 'file-current';
  });
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

test('rejects a missing current attachment and propagates transport failures', async () => {
  upload.mockRejectedValueOnce(new DeepseekDocumentUnavailableError());
  await expect(request([document(1)])).rejects.toBeInstanceOf(DeepseekDocumentUnavailableError);
  const transport = new Error('Provider unavailable');
  upload.mockRejectedValueOnce(transport);
  await expect(
    request([document(1), { role: 'user', content: 'Continue', timestamp: 2 }]),
  ).rejects.toBe(transport);
});
