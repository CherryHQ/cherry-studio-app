import type { ComponentProps, ReactNode } from 'react';
import { Text } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { ComposerSurface } from '@/frontend/components/Composer';

import { PaintingInput } from '../PaintingInput';
import { usePaintingReference } from '../usePaintingReference';

let mockSurfaceProps: ComponentProps<typeof ComposerSurface>;
const mockGetUri = jest.fn(async () => 'file:///first.png');
const mockGenerate = jest.fn(async (_input: unknown) => undefined);
const mockModelItem = {
  model: {
    name: 'Image model',
    imageGeneration: { modes: { generate: { supports: {} }, edit: { supports: {} } } },
  },
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
jest.mock('@/frontend/data', () => ({ useBackendModule: () => ({ getUri: mockGetUri }) }));
jest.mock('@/frontend/data/hooks', () => ({ usePreference: () => ['provider::image'] }));
jest.mock('@/frontend/components/ModelPicker', () => ({
  ModelPickerDrawer: () => null,
  ModelPickerIcon: () => null,
  useModelPickerData: () => ({ getModelItem: () => mockModelItem }),
}));
jest.mock('@/frontend/components/FileEntryPreview', () => ({ FileEntryPreview: () => null }));
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
  useComposerActions: () => ({ removeAttachment: jest.fn() }),
  useComposerPresentationActions: () => ({ runInputReplacement: jest.fn() }),
  useComposerState: () => ({ attachments: [], draft: 'Make it blue' }),
}));

type HarnessProps = { canSend?: boolean; output?: string; status?: 'idle' | 'generating' };

function Harness({ canSend, output = 'first', status = 'idle' }: HarnessProps) {
  const reference = usePaintingReference([
    { fileEntryId: output, mediaType: 'image/png', name: `${output}.png` },
  ]);
  return (
    <PaintingInput
      canSend={canSend}
      onCancel={() => undefined}
      onGenerate={mockGenerate}
      reference={reference}
      status={status}
    />
  );
}

describe('PaintingInput reference preview', () => {
  let renderer: ReactTestRenderer;
  const update = (props: HarnessProps) => act(() => renderer.update(<Harness {...props} />));
  const referenceIds = () =>
    renderer.root
      .findAllByProps({ testID: 'painting-input-attachments' })
      .flatMap((strip) =>
        strip.props.attachments.map(
          (attachment: { fileEntryId: string }) => attachment.fileEntryId,
        ),
      );
  const hasReferenceLabel = () =>
    renderer.root
      .findAllByType(Text)
      .some((text) => text.props.children === 'painting.input.editReference');

  beforeEach(() => {
    jest.clearAllMocks();
    act(() => {
      renderer = create(<Harness />);
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  it('clears the old preview immediately, submits its frozen reference, and shows the next completed image', async () => {
    const file = deferred<string>();
    mockGetUri.mockReturnValueOnce(file.promise);
    expect(referenceIds()).toEqual(['first']);
    expect(hasReferenceLabel()).toBe(true);
    let sending!: Promise<void>;
    act(() => {
      sending = mockSurfaceProps.onSend({ attachments: [], text: 'Make it blue' });
    });
    expect(referenceIds()).toEqual([]);
    expect(hasReferenceLabel()).toBe(false);
    expect(mockSurfaceProps.canSend).toBe(false);

    update({ canSend: false });
    await act(async () => {
      file.resolve('file:///first.png');
      await sending;
    });
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [expect.objectContaining({ fileEntryId: 'first', uri: 'file:///first.png' })],
        mode: 'edit',
      }),
    );
    expect(referenceIds()).toEqual([]);
    update({ status: 'generating' });
    expect(referenceIds()).toEqual([]);
    update({ status: 'idle', output: 'second' });
    expect(referenceIds()).toEqual(['second']);
    expect(hasReferenceLabel()).toBe(true);
  });

  it('restores the old reference when submission is rejected', async () => {
    mockGetUri.mockRejectedValueOnce(new Error('file unavailable'));
    await act(async () => {
      await expect(
        mockSurfaceProps.onSend({ attachments: [], text: 'Make it blue' }),
      ).rejects.toThrow('file unavailable');
    });
    expect(referenceIds()).toEqual(['first']);
    expect(hasReferenceLabel()).toBe(true);
  });

  it('restores the previous selection when generation fails or is cancelled without a new output', () => {
    update({ status: 'generating' });
    expect(referenceIds()).toEqual([]);
    update({ status: 'idle' });
    expect(referenceIds()).toEqual(['first']);
    expect(hasReferenceLabel()).toBe(true);
  });
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((accept) => {
    resolve = accept;
  });
  return { promise, resolve };
}
