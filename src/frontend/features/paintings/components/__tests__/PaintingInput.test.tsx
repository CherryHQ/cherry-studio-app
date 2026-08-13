import type { Painting } from '@cherrystudio/universal/data/types/painting';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerSendPayload } from '@/frontend/components/composer';

import type { PaintingGenerationResult } from '../../hooks/usePaintingGeneration';
import { PaintingInput } from '../PaintingInput';

const mockSetAttachments = jest.fn();
const mockOnGenerate = jest.fn();
const mockOnGenerated = jest.fn();
let mockComposerProps:
  | {
      canSend?: boolean;
      getSendErrorLabel?: (error: unknown) => string | undefined;
      onSend: (payload: ComposerSendPayload) => Promise<void>;
    }
  | undefined;
let mockToolbarActionLabels: string[] = [];
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

jest.mock('@/frontend/components/composer', () => ({
  ComposerAttachments: () => null,
  ComposerField: () => null,
  ComposerMenu: () => null,
  ComposerModelPill: () => null,
  ComposerSurface: ({ children, ...props }: { children?: React.ReactNode }) => {
    mockComposerProps = props as typeof mockComposerProps;
    return children;
  },
  useComposerActions: () => ({ setAttachments: mockSetAttachments }),
  useComposerFieldDismiss: () => jest.fn(),
  useComposerState: () => ({ attachments: [], draft: 'refine this' }),
}));

// The toolbar is assembled here now, so the settings button is a rendered node
// rather than a prop. Recording its label is what keeps that assertion possible.
jest.mock('@cherrystudio/ui/components', () => ({
  Composer: {
    Action: ({ accessibilityLabel }: { accessibilityLabel: string }) => {
      mockToolbarActionLabels.push(accessibilityLabel);
      return null;
    },
    Send: () => null,
    Toolbar: ({ children }: { children?: React.ReactNode }) => children,
  },
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
    mockComposerProps = undefined;
    mockToolbarActionLabels = [];
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

  it('keeps generated outputs out of the next input attachments', async () => {
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

    const payload: ComposerSendPayload = {
      attachments: [
        {
          fileEntryId: '00000000-0000-7000-8000-000000000000',
          id: 'painting-file:input',
          kind: 'image',
          mediaType: 'image/png',
          name: 'input.png',
          status: 'ready',
          uri: 'file:///input.png',
        },
      ],
      text: 'refine this',
    };

    await act(async () => {
      await mockComposerProps?.onSend(payload);
    });

    expect(mockOnGenerate).toHaveBeenCalledWith({
      attachments: payload.attachments,
      mode: 'edit',
      modelId: 'provider::image-model',
      modelName: 'Image Model',
      paramValues: {},
      prompt: payload.text,
    });
    expect(mockSetAttachments).not.toHaveBeenCalled();
    expect(mockOnGenerated).toHaveBeenCalledWith(generationResult);
  });

  it('treats cancellation as a completed send without publishing a result', async () => {
    mockOnGenerate.mockResolvedValueOnce(null);
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

    await act(async () => {
      await mockComposerProps?.onSend({ attachments: [], text: 'draw a cherry' });
    });

    expect(mockOnGenerated).not.toHaveBeenCalled();
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

    expect(mockComposerProps?.canSend).toBe(true);
    expect(mockToolbarActionLabels).toContain('painting.settings.open: 1024x1024');

    await act(async () => {
      await mockComposerProps?.onSend({ attachments: [], text: '' });
    });

    expect(mockOnGenerate).toHaveBeenCalledWith({
      attachments: [],
      mode: 'generate',
      modelId: 'provider::image-model',
      modelName: 'Image Model',
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

    const attachments: ComposerSendPayload['attachments'] = [
      {
        fileEntryId: '00000000-0000-7000-8000-000000000011',
        id: 'input-1',
        kind: 'image',
        mediaType: 'image/png',
        name: 'one.png',
        status: 'ready',
        uri: 'file:///one.png',
      },
      {
        fileEntryId: '00000000-0000-7000-8000-000000000012',
        id: 'input-2',
        kind: 'image',
        mediaType: 'image/png',
        name: 'two.png',
        status: 'ready',
        uri: 'file:///two.png',
      },
    ];

    let error: unknown;
    try {
      await mockComposerProps?.onSend({ attachments, text: 'edit' });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(mockComposerProps?.getSendErrorLabel?.(error)).toBe('painting.input.tooManyImages');
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

    expect(mockComposerProps?.canSend).toBe(true);

    let error: unknown;
    try {
      await mockComposerProps?.onSend({ attachments: [], text: 'draw' });
    } catch (caughtError) {
      error = caughtError;
    }

    expect(mockComposerProps?.getSendErrorLabel?.(error)).toBe('painting.input.invalidCustomSize');
    expect(mockOnGenerate).not.toHaveBeenCalled();
  });
});
