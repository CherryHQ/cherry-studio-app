import type { Painting } from '@cherrystudio/universal/data/types/painting';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ChatInputModelSettings, ChatInputSendPayload } from '@/frontend/features/chat/input';

import type { PaintingGenerationResult } from '../../hooks/usePaintingGeneration';
import { PaintingInput } from '../PaintingInput';

const mockSetAttachments = jest.fn();
const mockOnGenerate = jest.fn();
const mockOnGenerated = jest.fn();
let mockSurfaceProps:
  | {
      allowEmptySend?: boolean;
      getSendErrorLabel?: (error: unknown) => string | undefined;
      isSendEnabled: boolean;
      modelSettings?: ChatInputModelSettings;
      onSendPress: (payload: ChatInputSendPayload) => Promise<void>;
    }
  | undefined;
let mockSelectedModel: Record<string, unknown>;

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@cherrystudio/ui/icons', () => ({
  resolveIcon: jest.fn(),
}));

jest.mock('@/frontend/components/modelPicker', () => ({
  ModelPickerBottomSheet: () => null,
}));

jest.mock('../PaintingSettingsBottomSheet', () => ({
  PaintingSettingsBottomSheet: () => null,
}));

jest.mock('@/frontend/hooks/chat', () => ({
  useModelById: () => ({
    model: mockSelectedModel,
  }),
  useModels: () => ({
    models: [
      {
        id: 'provider::image-model',
        isHidden: false,
        providerId: 'provider',
      },
    ],
  }),
  useProviders: () => ({
    providers: [{ id: 'provider' }],
  }),
}));

jest.mock('@/frontend/features/chat/input', () => ({
  ChatInputActionSheet: () => null,
  ChatInputSurface: (props: typeof mockSurfaceProps) => {
    mockSurfaceProps = props;
    return null;
  },
  useChatInputActions: () => ({ setAttachments: mockSetAttachments }),
  useChatInputState: () => ({ draft: 'refine this', isActionSheetOpen: false }),
}));

jest.mock('../../utils/paintingOutputAttachment', () => ({
  createPaintingOutputAttachmentDraft: (output: { fileEntryId: string; uri: string }) => ({
    fileEntryId: output.fileEntryId,
    id: `painting-file:${output.fileEntryId}`,
    kind: 'image',
    mediaType: 'image/png',
    name: 'generated.png',
    uri: output.uri,
  }),
}));

const painting = {
  modelId: 'provider::image-model',
} as Painting;

const generationResult = {
  outputs: [
    {
      fileEntryId: '00000000-0000-7000-8000-000000000002',
      uri: 'file:///generated.png',
    },
  ],
  painting: {
    id: '00000000-0000-7000-8000-000000000001',
  },
} as PaintingGenerationResult;

describe('PaintingInput', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSurfaceProps = undefined;
    mockSelectedModel = {
      id: 'provider::image-model',
      modelId: 'image-model',
      name: 'Image Model',
      providerId: 'provider',
    };
    mockOnGenerate.mockResolvedValue(generationResult);
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('seeds the generated output as the next ordinary attachment', async () => {
    await act(async () => {
      renderer = create(
        <PaintingInput
          onCancel={jest.fn()}
          onGenerate={mockOnGenerate}
          onGenerated={mockOnGenerated}
          painting={painting}
          status="idle"
        />,
      );
    });

    const payload: ChatInputSendPayload = {
      attachments: [
        {
          fileEntryId: '00000000-0000-7000-8000-000000000000',
          id: 'painting-file:input',
          kind: 'image',
          mediaType: 'image/png',
          name: 'input.png',
          uri: 'file:///input.png',
        },
      ],
      text: 'refine this',
    };

    await act(async () => {
      await mockSurfaceProps?.onSendPress(payload);
    });

    expect(mockOnGenerate).toHaveBeenCalledWith({
      attachments: payload.attachments,
      mode: 'edit',
      modelId: 'provider::image-model',
      paramValues: {},
      prompt: payload.text,
    });
    expect(mockSetAttachments).toHaveBeenCalledWith([
      {
        fileEntryId: generationResult.outputs[0].fileEntryId,
        id: `painting-file:${generationResult.outputs[0].fileEntryId}`,
        kind: 'image',
        mediaType: 'image/png',
        name: 'generated.png',
        uri: generationResult.outputs[0].uri,
      },
    ]);
    expect(mockOnGenerated).toHaveBeenCalledWith(generationResult);
  });

  it('exposes Registry settings and permits a promptless generation when configured', async () => {
    mockSelectedModel.imageGeneration = {
      modes: {
        generate: {
          requirePrompt: false,
          supports: {
            size: {
              default: '1024x1024',
              options: ['1024x1024'],
              render: 'chips',
              type: 'enum',
            },
          },
        },
      },
    };

    await act(async () => {
      renderer = create(
        <PaintingInput
          onCancel={jest.fn()}
          onGenerate={mockOnGenerate}
          painting={painting}
          status="idle"
        />,
      );
    });

    expect(mockSurfaceProps?.allowEmptySend).toBe(true);
    expect(mockSurfaceProps?.isSendEnabled).toBe(true);
    expect(mockSurfaceProps?.modelSettings).toEqual(
      expect.objectContaining({ accessibilityLabel: 'painting.settings.open: 1024x1024' }),
    );

    await act(async () => {
      await mockSurfaceProps?.onSendPress({ attachments: [], text: '' });
    });

    expect(mockOnGenerate).toHaveBeenCalledWith({
      attachments: [],
      mode: 'generate',
      modelId: 'provider::image-model',
      paramValues: { size: '1024x1024' },
      prompt: '',
    });
  });

  it('blocks generation when image attachments exceed the Registry limit', async () => {
    mockSelectedModel.imageGeneration = {
      modes: {
        edit: {
          maxInputImages: 1,
          supports: {},
        },
      },
    };
    await act(async () => {
      renderer = create(
        <PaintingInput
          onCancel={jest.fn()}
          onGenerate={mockOnGenerate}
          painting={painting}
          status="idle"
        />,
      );
    });

    const attachments: ChatInputSendPayload['attachments'] = [
      {
        id: 'input-1',
        kind: 'image',
        mediaType: 'image/png',
        name: 'one.png',
        uri: 'file:///one.png',
      },
      {
        id: 'input-2',
        kind: 'image',
        mediaType: 'image/png',
        name: 'two.png',
        uri: 'file:///two.png',
      },
    ];

    let error: unknown;
    try {
      await mockSurfaceProps?.onSendPress({ attachments, text: 'edit' });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(mockSurfaceProps?.getSendErrorLabel?.(error)).toBe('painting.input.tooManyImages');
    expect(mockOnGenerate).not.toHaveBeenCalled();
  });

  it('reports invalid custom dimensions without starting generation', async () => {
    mockSelectedModel.imageGeneration = {
      modes: {
        generate: {
          supports: {
            size: {
              default: 'custom',
              options: ['1024x1024'],
              render: 'chips',
              type: 'enum',
            },
            customSize: {
              maxSide: 2048,
              minSide: 512,
              pairedEnumKey: 'size',
              type: 'size',
            },
          },
        },
      },
    };
    await act(async () => {
      renderer = create(
        <PaintingInput
          onCancel={jest.fn()}
          onGenerate={mockOnGenerate}
          painting={painting}
          status="idle"
        />,
      );
    });

    expect(mockSurfaceProps?.isSendEnabled).toBe(true);

    let error: unknown;
    try {
      await mockSurfaceProps?.onSendPress({ attachments: [], text: 'draw' });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(mockSurfaceProps?.getSendErrorLabel?.(error)).toBe('painting.input.invalidCustomSize');
    expect(mockOnGenerate).not.toHaveBeenCalled();
  });
});
