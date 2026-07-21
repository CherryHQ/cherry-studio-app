import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Painting } from '@/data/types/painting';
import type { ChatInputSendPayload } from '@/screens/ChatScreen/input/components/ChatInputSurface';

import type { PaintingGenerationResult } from '../../hooks/usePaintingGeneration';
import { PaintingInput } from '../PaintingInput';

const mockSetAttachments = jest.fn();
const mockOnGenerate = jest.fn();
const mockOnGenerated = jest.fn();
let mockSurfaceProps:
  | {
      onSendPress: (payload: ChatInputSendPayload) => Promise<void>;
    }
  | undefined;

jest.mock('@cherrystudio/ui/icons', () => ({
  resolveIcon: jest.fn(),
}));

jest.mock('@/components/modelPicker', () => ({
  ModelPickerBottomSheet: () => null,
}));

jest.mock('@/hooks/chat', () => ({
  useModelById: () => ({
    model: {
      id: 'provider::image-model',
      modelId: 'image-model',
      name: 'Image Model',
      providerId: 'provider',
    },
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

jest.mock('@/screens/ChatScreen/input/components/ChatInputActionSheet', () => ({
  ChatInputActionSheet: () => null,
}));

jest.mock('@/screens/ChatScreen/input/components/ChatInputSurface', () => ({
  ChatInputSurface: (props: typeof mockSurfaceProps) => {
    mockSurfaceProps = props;
    return null;
  },
}));

jest.mock('@/screens/ChatScreen/input/context/ChatInputProvider', () => ({
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
  output: {
    fileEntryId: '00000000-0000-7000-8000-000000000002',
    uri: 'file:///generated.png',
  },
  painting: {
    id: '00000000-0000-7000-8000-000000000001',
  },
} as PaintingGenerationResult;

describe('PaintingInput', () => {
  let renderer: ReactTestRenderer | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSurfaceProps = undefined;
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
      modelId: 'provider::image-model',
      prompt: payload.text,
    });
    expect(mockSetAttachments).toHaveBeenCalledWith([
      {
        fileEntryId: generationResult.output.fileEntryId,
        id: `painting-file:${generationResult.output.fileEntryId}`,
        kind: 'image',
        mediaType: 'image/png',
        name: 'generated.png',
        uri: generationResult.output.uri,
      },
    ]);
    expect(mockOnGenerated).toHaveBeenCalledWith(generationResult);
  });
});
