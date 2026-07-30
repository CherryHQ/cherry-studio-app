import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Message } from '@/data/types/message';
import type { Painting } from '@/data/types/painting';
import type {
  PaintingGenerationInput,
  PaintingGenerationResult,
} from '../../hooks/usePaintingGeneration';
import type { ResolvedPaintingFiles } from '../../hooks/usePaintings';

import { PaintingConversationScreen } from '../PaintingConversationScreen';

type PaintingInputProps = {
  onGenerate: (input: PaintingGenerationInput) => Promise<PaintingGenerationResult>;
  onGenerated?: (result: PaintingGenerationResult) => void;
};

type MessageListProps = {
  messages: Message[];
};

const mockRouterReplace = jest.fn();
const mockGenerate = jest.fn<Promise<PaintingGenerationResult>, [PaintingGenerationInput]>();
let mockPaintingInputProps: PaintingInputProps | undefined;
let mockMessageListProps: MessageListProps | undefined;
let mockInitialAttachments: unknown;
let mockUuidIndex = 0;

const mockPainting: Painting = {
  createdAt: '2026-07-21T10:00:00.000Z',
  files: {
    input: ['00000000-0000-7000-8000-000000000002'],
    output: ['00000000-0000-7000-8000-000000000003'],
  },
  id: '00000000-0000-7000-8000-000000000001',
  modelId: 'provider::image-model',
  orderKey: 'a0',
  prompt: 'Draw a cherry',
  providerId: 'provider',
  updatedAt: '2026-07-21T10:01:00.000Z',
};

const mockFiles: ResolvedPaintingFiles = {
  inputs: [
    {
      fileEntryId: mockPainting.files.input[0],
      id: `painting-file:${mockPainting.files.input[0]}`,
      kind: 'image',
      mediaType: 'image/jpeg',
      name: 'reference.jpg',
      uri: 'file:///reference.jpg',
    },
  ],
  outputs: [
    {
      fileEntryId: mockPainting.files.output[0],
      id: `painting-file:${mockPainting.files.output[0]}`,
      kind: 'image',
      mediaType: 'image/png',
      name: 'painting.png',
      uri: 'file:///painting.png',
    },
  ],
};

jest.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ paintingId: mockPainting.id }),
  useRouter: () => ({ replace: mockRouterReplace }),
}));

jest.mock('expo-router/react-navigation', () => ({
  useHeaderHeight: () => 0,
}));

jest.mock('expo-crypto', () => ({
  randomUUID: () => {
    mockUuidIndex += 1;
    return `00000000-0000-7000-8000-${String(mockUuidIndex).padStart(12, '0')}`;
  },
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('react-native-keyboard-controller', () => ({
  KeyboardStickyView: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('react-native-reanimated', () => ({
  useSharedValue: (value: unknown) => ({ value }),
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ bottom: 0 }),
}));

jest.mock('@/config/constants', () => ({
  isIOS: false,
}));

jest.mock('@/features/paintings/hooks/usePaintings', () => ({
  usePainting: () => ({ data: mockPainting, isError: false, isLoading: false }),
  useResolvedPaintingFiles: () => ({ data: mockFiles, isError: false, isLoading: false }),
}));

jest.mock('@/features/chat/input', () => ({
  ChatInputProvider: ({
    children,
    initialAttachments,
  }: {
    children: React.ReactNode;
    initialAttachments?: unknown;
  }) => {
    mockInitialAttachments = initialAttachments;
    return children;
  },
}));

jest.mock('@/features/chat/workspace', () => ({
  ChatMessageList: (props: MessageListProps) => {
    mockMessageListProps = props;
    return null;
  },
  ChatWorkspaceFrame: ({ children }: { children: React.ReactNode }) => children,
  ScrollToBottomButton: () => null,
  useFloatingChatInputLayout: () => ({
    contentBottomInset: 0,
    handleInputHeightChange: jest.fn(),
    inputHeightShared: { value: 0 },
  }),
}));

jest.mock('@/features/paintings/components/PaintingInput', () => ({
  PaintingInput: (props: PaintingInputProps) => {
    mockPaintingInputProps = props;
    return null;
  },
}));

jest.mock('@/features/paintings/hooks/usePaintingGeneration', () => ({
  usePaintingGeneration: () => ({
    cancel: jest.fn(),
    generate: mockGenerate,
    status: 'idle',
  }),
}));

describe('PaintingConversationScreen', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPaintingInputProps = undefined;
    mockMessageListProps = undefined;
    mockInitialAttachments = undefined;
    mockUuidIndex = 0;
    await act(async () => {
      renderer = create(<PaintingConversationScreen />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('shows only the pending turn and replaces the route after generation succeeds', async () => {
    let resolveGeneration: ((result: PaintingGenerationResult) => void) | undefined;
    mockGenerate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveGeneration = resolve;
        }),
    );
    const input: PaintingGenerationInput = {
      attachments: [],
      mode: 'generate',
      modelId: 'provider::image-model',
      paramValues: {},
      prompt: 'Make it brighter',
    };
    const result = {
      outputs: [
        {
          fileEntryId: '00000000-0000-7000-8000-000000000005',
          uri: 'file:///brighter.png',
        },
      ],
      painting: {
        ...mockPainting,
        id: '00000000-0000-7000-8000-000000000004',
      },
    } satisfies PaintingGenerationResult;

    let generationPromise: Promise<PaintingGenerationResult> | undefined;
    await act(async () => {
      generationPromise = mockPaintingInputProps?.onGenerate(input);
      await Promise.resolve();
    });

    expect(mockMessageListProps?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(mockMessageListProps?.messages[0].searchableText).toBe(input.prompt);
    expect(mockMessageListProps?.messages[1].status).toBe('pending');
    expect(mockRouterReplace).not.toHaveBeenCalled();

    await act(async () => {
      resolveGeneration?.(result);
      await generationPromise;
    });
    await act(async () => {
      mockPaintingInputProps?.onGenerated?.(result);
    });

    expect(mockRouterReplace).toHaveBeenCalledWith({
      params: { paintingId: result.painting.id },
      pathname: '/paintings/[paintingId]/conversation',
    });
    expect(mockMessageListProps?.messages[0].searchableText).toBe(mockPainting.prompt);
  });

  it('shows persisted history without seeding the output as an input attachment', () => {
    expect(mockInitialAttachments).toBeUndefined();
    expect(mockMessageListProps?.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
    ]);
    expect(mockMessageListProps?.messages[0].searchableText).toBe(mockPainting.prompt);
  });
});
