import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { Painting } from '@/shared/domain/painting';

import { usePaintingViewerActions } from '../usePaintingViewerActions';

const mockRouterPush = jest.fn();
const mockCreatePaintingDraftHandoff = jest.fn((_input: unknown) => 'handoff');
const mockCreatePaintingOutputAttachmentDraft = jest.fn((_output: unknown) => ({
  id: 'painting-output',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: jest.fn(), push: mockRouterPush }),
}));

jest.mock('expo-media-library', () => ({
  Asset: { create: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: jest.fn(),
    removeQueries: jest.fn(),
  }),
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/runtime', () => ({
  useDataServices: () => ({ painting: { delete: jest.fn() } }),
}));

jest.mock('@/features/paintings/utils/paintingDraftHandoff', () => ({
  createPaintingDraftHandoff: (input: unknown) => mockCreatePaintingDraftHandoff(input),
}));

jest.mock('@/features/paintings/utils/paintingOutputAttachment', () => ({
  createPaintingOutputAttachmentDraft: (output: unknown) =>
    mockCreatePaintingOutputAttachmentDraft(output),
}));

const painting = {
  id: '00000000-0000-7000-8000-000000000001',
  prompt: 'Draw a cherry',
} as Painting;

let actions: ReturnType<typeof usePaintingViewerActions> | undefined;
let renderer: ReactTestRenderer | undefined;

function Probe() {
  const currentActions = usePaintingViewerActions({
    currentOutput: {
      fileEntryId: '00000000-0000-7000-8000-000000000002',
      uri: 'file:///painting.png',
    },
    painting,
  });

  useEffect(() => {
    actions = currentActions;
  }, [currentActions]);

  return null;
}

describe('usePaintingViewerActions', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    actions = undefined;
    await act(async () => {
      renderer = create(<Probe />);
    });
  });

  afterEach(async () => {
    await act(async () => renderer?.unmount());
  });

  it('opens the current painting conversation', () => {
    actions?.viewConversation();

    expect(mockRouterPush).toHaveBeenCalledWith({
      params: { paintingId: painting.id },
      pathname: '/paintings/[paintingId]/conversation',
    });
  });

  it('opens edit with the current output attached and no prefilled prompt', () => {
    actions?.edit();

    expect(mockCreatePaintingOutputAttachmentDraft).toHaveBeenCalledWith({
      fileEntryId: '00000000-0000-7000-8000-000000000002',
      uri: 'file:///painting.png',
    });
    expect(mockCreatePaintingDraftHandoff).toHaveBeenCalledWith({
      attachments: [{ id: 'painting-output' }],
      draft: '',
    });
    expect(mockRouterPush).toHaveBeenCalledWith({
      params: { handoff: 'handoff', paintingId: painting.id },
      pathname: '/paintings',
    });
  });
});
