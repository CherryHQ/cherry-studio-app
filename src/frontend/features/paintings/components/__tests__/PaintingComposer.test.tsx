import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { MessageListProps } from '@/frontend/components/messages';
import type { Painting } from '@/shared/data/types/painting';

import type {
  PaintingGenerationInput,
  PaintingGenerationResult,
} from '../../hooks/usePaintingGeneration';
import type { ResolvedPaintingFiles } from '../../hooks/usePaintings';
import { PaintingComposer } from '../PaintingComposer';

type PaintingInputProps = {
  onCancel: () => void;
  onGenerate: (input: PaintingGenerationInput) => Promise<PaintingGenerationResult | null>;
};

const painting: Painting = {
  createdAt: '2026-08-11T00:00:00.000Z',
  files: { input: ['input-1'], output: ['output-1', 'output-1b'] },
  id: 'painting-1',
  modelId: 'provider::image-model',
  orderKey: 'painting-1',
  prompt: 'Draw a cherry',
  providerId: 'provider',
  updatedAt: '2026-08-11T00:01:00.000Z',
};
const files: ResolvedPaintingFiles = {
  inputs: [
    {
      fileEntryId: 'input-1',
      id: 'painting-file:input-1',
      kind: 'image',
      mediaType: 'image/png',
      name: 'input.png',
      status: 'ready',
      uri: 'file:///input.png',
    },
  ],
  outputAspectRatio: 16 / 9,
  outputs: [
    {
      fileEntryId: 'output-1',
      id: 'painting-file:output-1',
      kind: 'image',
      mediaType: 'image/png',
      name: 'output.png',
      status: 'ready',
      uri: 'file:///output.png',
    },
    {
      fileEntryId: 'output-1b',
      id: 'painting-file:output-1b',
      kind: 'image',
      mediaType: 'image/png',
      name: 'output-1b.png',
      status: 'ready',
      uri: 'file:///output-1b.png',
    },
  ],
};
const result: PaintingGenerationResult = {
  outputs: [
    { fileEntryId: 'output-2', uri: 'file:///output-2.png' },
    { fileEntryId: 'output-3', uri: 'file:///output-3.png' },
  ],
  painting: {
    ...painting,
    files: { input: [], output: ['output-2', 'output-3'] },
    id: 'painting-2',
  },
};
const input: PaintingGenerationInput = {
  attachments: [],
  mode: 'generate',
  modelId: 'provider::image-model',
  modelName: 'Image Model',
  paramValues: { size: '1664x928' },
  prompt: 'Draw a mountain lake',
};

const mockCancel = jest.fn();
const mockGenerate = jest.fn<Promise<PaintingGenerationResult | null>, [PaintingGenerationInput]>();
const mockGeneration = {
  aspectRatio: 16 / 9,
  cancel: mockCancel,
  error: null as Error | null,
  generate: mockGenerate,
  interruption: null as { message?: string } | null,
  outputs: [...result.outputs],
  paramValues: { size: '1664x928' },
  status: 'idle' as 'generating' | 'idle',
};
let mockAssistantProps: Record<string, unknown> | undefined;
let mockInputProps: PaintingInputProps | undefined;
let mockMessageListMounts = 0;
let mockMessageListUnmounts = 0;
let mockMessageListProps: MessageListProps | undefined;
let mockProviderProps:
  | { initialAttachments?: readonly unknown[]; initialDraft?: string }
  | undefined;
let mockUuid = 0;

jest.mock('expo-crypto', () => ({
  randomUUID: () => `uuid-${++mockUuid}`,
}));

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 0,
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/utils/constants', () => ({ isIOS: false }));

jest.mock('@cherrystudio/ui/components', () => ({
  useComposerDockLayout: () => ({
    contentBottomInset: 88,
    handleInputHeightChange: jest.fn(),
    inputHeightShared: { value: 88 },
    keyboardOffset: 26,
  }),
}));

jest.mock('@/frontend/components/composer', () => ({
  ComposerDock: ({ children }: { children: React.ReactNode }) => children,
  ComposerSessionProvider: ({ children, ...props }: { children: React.ReactNode }) => {
    mockProviderProps = props;
    return children;
  },
}));

jest.mock('@/frontend/components/messages', () => ({
  MessageList: (props: MessageListProps) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(() => {
      mockMessageListMounts += 1;
      return () => {
        mockMessageListUnmounts += 1;
      };
    }, []);
    mockMessageListProps = props;
    const assistant = props.messages.find((message) => message.role === 'assistant');
    return assistant ? props.renderMessage(assistant) : null;
  },
}));

jest.mock('../../hooks/usePaintingGeneration', () => ({
  usePaintingGeneration: () => mockGeneration,
}));

jest.mock('../../hooks/usePaintingJobs', () => ({
  paintingJobParamValues: () => undefined,
  usePaintingJobs: () => ({
    activeByPaintingId: new Map(),
    interruptedByPaintingId: new Map(),
  }),
}));

jest.mock('../PaintingAssistantMessage', () => ({
  PaintingAssistantMessage: (props: Record<string, unknown>) => {
    mockAssistantProps = props;
    return null;
  },
}));

jest.mock('../PaintingInput', () => ({
  PaintingInput: (props: PaintingInputProps) => {
    mockInputProps = props;
    return null;
  },
}));

describe('PaintingComposer', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAssistantProps = undefined;
    mockInputProps = undefined;
    mockMessageListMounts = 0;
    mockMessageListUnmounts = 0;
    mockMessageListProps = undefined;
    mockProviderProps = undefined;
    mockUuid = 0;
    mockGeneration.aspectRatio = 16 / 9;
    mockGeneration.error = null;
    mockGeneration.interruption = null;
    mockGeneration.outputs = [...files.outputs];
    mockGeneration.status = 'idle';
    mockGenerate.mockResolvedValue(result);
  });

  afterEach(() => {
    act(() => renderer?.unmount());
  });

  function renderComposer() {
    act(() => {
      renderer = create(
        <PaintingComposer
          initialAttachments={[]}
          initialDraft=""
          initialFiles={files}
          isHandoff={false}
          painting={painting}
        />,
      );
    });
  }

  it('projects a completed painting while keeping the composer empty', () => {
    renderComposer();

    expect(mockMessageListProps?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(mockMessageListProps?.messages[0].data.parts?.[0]).toEqual({
      text: painting.prompt,
      type: 'text',
    });
    expect(mockAssistantProps).toMatchObject({
      animateOutput: false,
      outputs: files.outputs,
      paintingId: painting.id,
      status: 'idle',
    });
    expect(mockMessageListProps?.extraData).toMatchObject({
      outputs: files.outputs,
      paintingId: painting.id,
      status: 'idle',
    });
    expect(mockProviderProps).toMatchObject({ initialAttachments: [], initialDraft: '' });
  });

  it('replaces the persisted turn with a pending request and then its result', async () => {
    let resolveGeneration: ((value: PaintingGenerationResult) => void) | undefined;
    mockGenerate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    renderComposer();

    let generationPromise: Promise<PaintingGenerationResult | null> | undefined;
    await act(async () => {
      mockGeneration.status = 'generating';
      generationPromise = mockInputProps?.onGenerate(input);
      await Promise.resolve();
    });

    expect(mockMessageListProps?.messages[0].data.parts?.[0]).toEqual({
      text: input.prompt,
      type: 'text',
    });
    expect(mockMessageListProps?.messages[1].status).toBe('pending');
    expect(mockMessageListProps?.enteringMessageId).toBe('uuid-2');

    await act(async () => {
      mockGeneration.status = 'idle';
      mockGeneration.outputs = result.outputs;
      resolveGeneration?.(result);
      await generationPromise;
    });

    expect(mockMessageListProps?.messages[1].status).toBe('success');
    expect(mockAssistantProps).toMatchObject({
      animateOutput: true,
      outputs: result.outputs,
      paintingId: result.painting.id,
    });
    expect(mockMessageListMounts).toBe(1);
    expect(mockMessageListUnmounts).toBe(0);
  });

  it('keeps a failed turn but clears a cancelled turn', async () => {
    renderComposer();
    mockGenerate.mockImplementationOnce(async () => {
      mockGeneration.error = new Error('provider unavailable');
      throw mockGeneration.error;
    });

    await act(async () => {
      await mockInputProps?.onGenerate(input).catch(() => undefined);
    });
    expect(mockMessageListProps?.messages[1].status).toBe('error');
    expect(mockAssistantProps?.error).toEqual(new Error('provider unavailable'));

    mockGeneration.error = null;
    mockGenerate.mockResolvedValueOnce(null);
    await act(async () => {
      await mockInputProps?.onGenerate(input);
    });
    expect(mockMessageListProps?.messages).toEqual([]);
  });

  it('keeps an interrupted receipt in the message list with an empty composer', () => {
    const receipt = { ...painting, files: { input: ['input-1'], output: [] } };
    const pendingFiles = { inputs: files.inputs, outputs: [] };
    mockGeneration.outputs = [];
    mockGeneration.interruption = { message: 'Invalid JSON response' };
    act(() => {
      renderer = create(
        <PaintingComposer
          initialAttachments={[]}
          initialDraft=""
          initialFiles={pendingFiles}
          isHandoff={false}
          painting={receipt}
        />,
      );
    });

    expect(mockMessageListProps?.messages[0].data.parts).toEqual([
      { text: painting.prompt, type: 'text' },
      {
        filename: 'input.png',
        mediaType: 'image/png',
        providerMetadata: {
          cherry: { fileEntryId: 'input-1' },
        },
        type: 'file',
        url: 'cherry://file/input-1',
      },
    ]);
    expect(mockMessageListProps?.messages[1].status).toBe('error');
    expect(mockAssistantProps).toMatchObject({
      interruption: { message: 'Invalid JSON response' },
      paintingId: receipt.id,
    });
    expect(mockProviderProps).toMatchObject({ initialAttachments: [], initialDraft: '' });
  });
});
