import type { ImageGenerationSupport } from '@cherrystudio/provider-registry';
import { useEffect, type ComponentProps, type ReactNode } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerSurface } from '@/frontend/components/Composer';
import type { ComposerAttachmentReady } from '@/frontend/components/Composer/utils/composerAttachments';
import type { Model } from '@/shared/data/types/model';

import { PaintingInput } from '../PaintingInput';
import { PaintingInputProvider, usePaintingInputSession } from '../PaintingInputProvider';

let mockSurfaceProps: ComponentProps<typeof ComposerSurface>;
let mockSession: ReturnType<typeof usePaintingInputSession>;
let mockComposerState: { attachments: ComposerAttachmentReady[]; draft: string };
let mockModel: Model;
const mockGenerate = jest.fn(async (_input: unknown) => undefined);
const mockPrepareAttachments = jest.fn(
  async ({ fileEntryIds }: { fileEntryIds: readonly string[] }) => fileEntryIds.map(mockFile),
);
function mockFile(id: string) {
  return {
    entry: { id, filename: `${id}.png`, size: 100, mediaType: 'image/png' },
    uri: `file:///${id}.png`,
  };
}
const image = (id: string) => ({ fileEntryId: id, mediaType: 'image/png', name: `${id}.png` });
const attachment = (id: string): ComposerAttachmentReady => ({
  ...image(id),
  id,
  kind: 'image',
  status: 'ready',
  uri: `file:///${id}.png`,
  size: 100,
});
const support: ImageGenerationSupport = {
  modes: { generate: { supports: {} }, edit: { supports: {}, maxInputImages: 1 } },
};

jest.mock('@cherrystudio/app-icons/icons/settings-2', () => () => null);
jest.mock('@cherrystudio/ui/components', () => {
  const children = ({ children }: { children?: ReactNode }) => children;
  return {
    Button: Object.assign(children, { Label: children }),
    Composer: { Action: children, Send: () => null, Toolbar: children },
  };
});
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/appShell/navigation', () => ({ useOpenProviderSetup: () => jest.fn() }));
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => ({ prepareAttachments: mockPrepareAttachments }),
}));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => ['provider::image'] }));
jest.mock('@/frontend/components/ModelPicker', () => ({
  ModelPickerDrawer: () => null,
  ModelPickerIcon: () => null,
  useModelPickerData: () => ({ getModelItem: () => ({ model: mockModel }), isLoading: false }),
}));
jest.mock('@/frontend/components/FileEntryPreview', () => ({
  FileEntryPreview: () => null,
  useResolvedFile: (id: string | undefined) => ({
    data: id ? mockFile(id) : null,
    isLoading: false,
  }),
}));
jest.mock('../PaintingSettingsBottomSheet', () => ({ PaintingSettingsBottomSheet: () => null }));
jest.mock('@/frontend/components/Composer', () => ({
  ComposerAttachmentStrip: (props: Record<string, unknown>) =>
    jest
      .requireActual('react')
      .createElement('attachment-strip', { ...props, testID: 'painting-input-attachments' }),
  ComposerField: () => null,
  ComposerMenu: () => null,
  ComposerModelPill: () => null,
  ComposerSurface: (props: ComponentProps<typeof ComposerSurface>) => {
    mockSurfaceProps = props;
    return props.children;
  },
  useComposerActions: () => ({ removeAttachment: jest.fn(), clearAttachments: jest.fn() }),
  useComposerPresentationActions: () => ({ runInputReplacement: jest.fn() }),
  useComposerState: () => mockComposerState,
}));

type HarnessProps = {
  canSend?: boolean;
  outputs?: string[];
  status?: 'idle' | 'generating';
  showText?: boolean;
};
function Probe({ canSend, status = 'idle', showText }: HarnessProps) {
  const session = usePaintingInputSession();
  useEffect(() => {
    mockSession = session;
  }, [session]);
  return showText ? null : (
    <PaintingInput
      canSend={canSend}
      onCancel={() => undefined}
      onGenerate={mockGenerate}
      status={status}
    />
  );
}
const initialOutputs = ['first'];
function Harness({ outputs = initialOutputs, ...props }: HarnessProps) {
  return (
    <PaintingInputProvider result={{ id: outputs.join(','), images: outputs.map(image) }}>
      <Probe {...props} />
    </PaintingInputProvider>
  );
}

describe('capability-aware painting input', () => {
  let renderer: ReactTestRenderer;
  const update = (props: HarnessProps = {}) => act(() => renderer.update(<Harness {...props} />));
  const referenceIds = () =>
    renderer.root
      .findAllByProps({ testID: 'painting-input-attachments' })
      .flatMap((strip) =>
        strip.props.attachments.map((item: { fileEntryId: string }) => item.fileEntryId),
      );
  const send = async (text = 'Make it blue') => {
    const attachments = mockComposerState.attachments;
    mockComposerState = { attachments: [], draft: '' };
    await act(async () => {
      await mockSurfaceProps.onSend({ attachments, text });
    });
  };
  beforeEach(() => {
    jest.clearAllMocks();
    mockComposerState = { attachments: [], draft: 'Make it blue' };
    mockModel = {
      id: 'provider::image',
      providerId: 'provider',
      modelId: 'image',
      name: 'Image model',
      capabilities: ['image-generation'],
      isEnabled: true,
      isHidden: false,
      supportsStreaming: false,
      imageGeneration: support,
    };
    act(() => {
      renderer = create(<Harness />);
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  it('hides the old reference immediately and submits the frozen image before adopting the next success', async () => {
    const preparation = deferred<ReturnType<typeof mockFile>[]>();
    mockPrepareAttachments.mockReturnValueOnce(preparation.promise);
    expect(referenceIds()).toEqual(['first']);
    let sending!: Promise<void>;
    mockComposerState = { attachments: [], draft: '' };
    act(() => {
      sending = mockSurfaceProps.onSend({ attachments: [], text: 'Make it blue' });
    });
    expect(referenceIds()).toEqual([]);
    expect(mockSurfaceProps.canSend).toBe(false);
    await act(async () => {
      preparation.resolve([mockFile('first')]);
      await sending;
    });
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'edit',
        attachments: [expect.objectContaining({ fileEntryId: 'first' })],
      }),
    );
    update({ status: 'generating' });
    expect(referenceIds()).toEqual([]);
    update({ outputs: ['second'] });
    expect(referenceIds()).toEqual(['second']);
  });

  it('preserves the previous reference after a rejected submission or a cancelled follow-up', async () => {
    mockPrepareAttachments.mockRejectedValueOnce(new Error('file unavailable'));
    await expect(send()).rejects.toThrow('file unavailable');
    expect(referenceIds()).toEqual(['first']);
    update({ status: 'generating' });
    update();
    expect(referenceIds()).toEqual(['first']);
  });

  it('keeps generate-only models usable without submitting the automatic candidate', async () => {
    mockModel = {
      ...mockModel,
      imageGeneration: { modes: { generate: { supports: {} } } },
      inputModalities: ['text'],
    };
    update();
    expect(referenceIds()).toEqual([]);
    expect(mockSurfaceProps.canSend).toBe(true);
    await send('Draw a dog');
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'generate', attachments: [], prompt: 'Draw a dog' }),
    );
  });

  it('pauses automatic references across incompatible models but blocks explicit references', () => {
    mockModel = { ...mockModel, imageGeneration: { modes: { generate: { supports: {} } } } };
    update();
    expect(mockSurfaceProps.canSend).toBe(true);
    mockModel = { ...mockModel, imageGeneration: support };
    update();
    expect(referenceIds()).toEqual(['first']);
    act(() => mockSession.reference.select(image('first')));
    mockModel = { ...mockModel, imageGeneration: { modes: { generate: { supports: {} } } } };
    update();
    expect(mockSurfaceProps.canSend).toBe(false);
  });

  it('gives manual images priority without exceeding a single-image model limit', async () => {
    mockComposerState = { draft: 'Make it blue', attachments: [attachment('manual')] };
    update();
    expect(referenceIds()).toEqual(['manual']);
    expect(mockSurfaceProps.canSend).toBe(true);
    await send();
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ fileEntryId: 'manual' })],
      }),
    );
  });

  it('allows new generation from multiple candidates without forcing a selection', () => {
    mockComposerState = { attachments: [], draft: '' };
    update({ outputs: ['first', 'second'] });
    mockComposerState = { attachments: [], draft: 'Draw another image' };
    update({ outputs: ['first', 'second'] });
    expect(referenceIds()).toEqual([]);
    expect(mockSurfaceProps.canSend).toBe(true);
  });

  it('permits a promptless image operation and blocks an edit-only operation without an image', async () => {
    mockModel = {
      ...mockModel,
      imageGeneration: { modes: { edit: { supports: {}, requirePrompt: false } } },
    };
    mockComposerState = { draft: '', attachments: [] };
    update();
    expect(mockSurfaceProps.canSend).toBe(true);
    await send('');
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'edit', prompt: '' }),
    );
    act(() => mockSession.reference.clear());
    expect(mockSurfaceProps.canSend).toBe(false);
  });

  it('keeps parameter drafts across text controls and preserves invalid input for correction', () => {
    mockModel = {
      ...mockModel,
      imageGeneration: {
        modes: { edit: { supports: { numImages: { type: 'range', min: 1, max: 4 } } } },
      },
    };
    update();
    const key = JSON.stringify([mockModel.id, 'edit']);
    act(() =>
      mockSession.setParameterDraft(key, { modelId: mockModel.id, values: { numImages: 20 } }),
    );
    expect(mockSurfaceProps.canSend).toBe(false);
    update({ showText: true });
    update();
    expect(mockSession.parameterDrafts[key].values).toEqual({ numImages: 20 });
    expect(mockSurfaceProps.canSend).toBe(false);
  });

  it('restores a visited mode default after editing the other mode', () => {
    mockModel = {
      ...mockModel,
      id: 'provider::parameters',
      imageGeneration: {
        modes: {
          generate: { supports: { numImages: { type: 'range', min: 1, max: 4, default: 1 } } },
          edit: { supports: { numImages: { type: 'range', min: 1, max: 4, default: 2 } } },
        },
      },
    };
    update();
    const editKey = JSON.stringify([mockModel.id, 'edit']);
    const generateKey = JSON.stringify([mockModel.id, 'generate']);
    expect(mockSession.parameterDrafts[editKey].values).toEqual({ numImages: 2 });
    act(() => mockSession.reference.clear());
    act(() =>
      mockSession.setParameterDraft(generateKey, {
        modelId: mockModel.id,
        values: { numImages: 3 },
      }),
    );
    act(() => mockSession.reference.select(image('first')));
    expect(mockSession.parameterDrafts[editKey].values).toEqual({ numImages: 2 });
    expect(mockSession.lastParameterDraft?.values).toEqual({ numImages: 2 });
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
