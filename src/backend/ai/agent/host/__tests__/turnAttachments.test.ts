import {
  AgentProtocolError,
  type AgentInputPart,
  type AgentMessageView,
} from '@/shared/contracts/agent';
import { FileEntryIdSchema, type FileEntryId } from '@/shared/data/types/file';

import {
  createTurnResourceLedger,
  type ManagedFileFact,
  type ManagedFileResolver,
} from '../../resources/managedFileResolver';
import { FakeRuntime, type RuntimeModelPreflight } from '../../runtime';
import {
  assertAttachmentRequestSupported,
  materializeRuntimeAttachments,
  resolveManagedInput,
  resolveRuntimeTextAttachments,
} from '../turnAttachments';

const FIRST_ID = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000001');
const SECOND_ID = FileEntryIdSchema.parse('00000000-0000-7000-8000-000000000002');
const NOW = '2026-01-01T00:00:00.000Z';

const IMAGE_MODEL: RuntimeModelPreflight = {
  contextWindow: 128_000,
  inputModalities: ['text', 'image'],
  maxInputTokens: 120_000,
  maxOutputTokens: 8_000,
  supportsTools: true,
};

const TEXT_MODEL: RuntimeModelPreflight = {
  ...IMAGE_MODEL,
  inputModalities: ['text'],
};

describe('turn attachments', () => {
  test('resolves current and historical managed facts while canonicalizing current input', async () => {
    const current = fact(FIRST_ID, 'managed.png', 'image/png');
    const historical = fact(SECOND_ID, 'history.txt', 'text/plain');
    const facts = new Map([
      [FIRST_ID, current],
      [SECOND_ID, historical],
    ]);
    const files = resolver(facts);
    const input: AgentInputPart[] = [
      { type: 'text', text: 'Inspect this.' },
      { type: 'file', fileEntryId: FIRST_ID, mediaType: 'image/png' },
    ];

    const resolved = await resolveManagedInput(
      files,
      input,
      [messageWithFile(historical)],
      new AbortController().signal,
    );

    expect(files.resolveAvailable).toHaveBeenCalledWith([FIRST_ID, SECOND_ID]);
    expect(resolved.availableFiles).toEqual(facts);
    expect(resolved.inputFiles).toEqual(new Map([[FIRST_ID, current]]));
    expect(resolved.parts).toEqual([
      { type: 'text', text: 'Inspect this.' },
      {
        type: 'file',
        fileEntryId: FIRST_ID,
        mediaType: 'image/png',
        name: 'managed.png',
      },
    ]);
    expect(input[1]).not.toHaveProperty('name');
  });

  test('rejects forged current metadata with a protocol-safe error', async () => {
    const files = resolver(new Map([[FIRST_ID, fact(FIRST_ID, 'managed.png', 'image/png')]]));

    await expect(
      resolveManagedInput(
        files,
        [
          {
            type: 'file',
            fileEntryId: FIRST_ID,
            mediaType: 'image/jpeg',
            name: 'forged.jpg',
          },
        ],
        [],
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      view: {
        code: 'ATTACHMENT_METADATA_MISMATCH',
        message: 'Attached file metadata could not be verified.',
        retryable: false,
      },
    });
  });

  test('projects attachment capability and media admission failures at the Host boundary', () => {
    const historicalText = fact(FIRST_ID, 'history.txt', 'text/plain');
    const historicalResources = createTurnResourceLedger(
      new Map(),
      [FIRST_ID],
      new Map([[FIRST_ID, historicalText]]),
    );
    const runtimeWithoutAttachments = new FakeRuntime({
      descriptor: {
        id: 'text-only',
        name: 'Text-only Runtime',
        capabilities: {
          approvals: true,
          attachments: false,
          reasoning: true,
          tools: true,
        },
      },
    });

    expect(
      captureProtocolError(() =>
        assertAttachmentRequestSupported(
          runtimeWithoutAttachments,
          [],
          [messageWithFile(historicalText)],
          historicalResources,
          TEXT_MODEL,
        ),
      ),
    ).toMatchObject({ view: { code: 'CAPABILITY_UNSUPPORTED' } });

    const unsupported = fact(SECOND_ID, 'report.pdf', 'application/pdf');
    const unsupportedResources = createTurnResourceLedger(new Map([[SECOND_ID, unsupported]]), []);
    expect(
      captureProtocolError(() =>
        assertAttachmentRequestSupported(
          new FakeRuntime(),
          [
            {
              type: 'file',
              fileEntryId: SECOND_ID,
              mediaType: unsupported.mediaType,
              name: unsupported.name,
            },
          ],
          [],
          unsupportedResources,
          IMAGE_MODEL,
        ),
      ),
    ).toMatchObject({ view: { code: 'ATTACHMENT_INVALID' } });
  });

  test('projects invalid current text content to an attachment protocol error', async () => {
    const text = fact(FIRST_ID, 'spoofed.txt', 'text/plain', 3);
    const files = resolver(new Map([[FIRST_ID, text]]), {
      readAsBytes: async () => Uint8Array.from([65, 0, 66]),
    });
    const input: AgentInputPart[] = [
      {
        type: 'file',
        fileEntryId: FIRST_ID,
        mediaType: text.mediaType,
        name: text.name,
      },
    ];

    await expect(
      resolveRuntimeTextAttachments(
        files,
        input,
        [],
        createTurnResourceLedger(new Map([[FIRST_ID, text]]), []),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({
      view: {
        code: 'ATTACHMENT_INVALID',
        message: expect.stringContaining('contains NUL bytes'),
      },
    });
  });

  test('replaces current and historical images with notes without reading bytes for a text model', async () => {
    const current = fact(FIRST_ID, 'current.png', 'image/png');
    const historical = fact(SECOND_ID, 'historical.png', 'image/png');
    const files = resolver(
      new Map([
        [FIRST_ID, current],
        [SECOND_ID, historical],
      ]),
    );
    const resources = createTurnResourceLedger(
      new Map([[FIRST_ID, current]]),
      [SECOND_ID],
      new Map([
        [FIRST_ID, current],
        [SECOND_ID, historical],
      ]),
    );

    const attachments = await materializeRuntimeAttachments({
      files,
      history: [messageWithFile(historical)],
      inputParts: [
        {
          type: 'file',
          fileEntryId: FIRST_ID,
          mediaType: current.mediaType,
          name: current.name,
        },
      ],
      modelPreflight: TEXT_MODEL,
      resources,
      signal: new AbortController().signal,
      textAttachments: new Map(),
    });

    const omitted = {
      type: 'text',
      text: '[image attachment omitted: this model does not accept image input]',
    };
    expect(attachments).toEqual(
      new Map([
        [FIRST_ID, omitted],
        [SECOND_ID, omitted],
      ]),
    );
    expect(files.readAsDataUrl).not.toHaveBeenCalled();
  });
});

function fact(
  fileEntryId: FileEntryId,
  name: string,
  mediaType: string,
  size = 128,
): ManagedFileFact {
  return { fileEntryId, mediaType, name, size };
}

function messageWithFile(file: ManagedFileFact): AgentMessageView {
  return {
    id: `message-${file.fileEntryId}`,
    sessionId: 'session-1',
    turnId: 'turn-1',
    role: 'user',
    status: 'success',
    parts: [
      {
        id: `part-${file.fileEntryId}`,
        type: 'file',
        fileEntryId: file.fileEntryId,
        mediaType: file.mediaType,
        name: file.name,
        purpose: 'input-attachment',
      },
    ],
    usage: null,
    modelId: null,
    inferenceSnapshot: null,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function resolver(
  facts: ReadonlyMap<string, ManagedFileFact>,
  overrides: Partial<Pick<ManagedFileResolver, 'readAsBytes' | 'readAsDataUrl'>> = {},
): ManagedFileResolver {
  return {
    resolveAvailable: jest.fn(
      async (fileEntryIds: readonly FileEntryId[]) =>
        new Map([...facts].filter(([fileEntryId]) => fileEntryIds.includes(fileEntryId))),
    ),
    readAsBytes: jest.fn(overrides.readAsBytes ?? (async () => undefined)),
    readAsDataUrl: jest.fn(overrides.readAsDataUrl ?? (async () => undefined)),
  };
}

function captureProtocolError(action: () => void): AgentProtocolError {
  try {
    action();
  } catch (error) {
    if (error instanceof AgentProtocolError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected an Agent protocol error.');
}
