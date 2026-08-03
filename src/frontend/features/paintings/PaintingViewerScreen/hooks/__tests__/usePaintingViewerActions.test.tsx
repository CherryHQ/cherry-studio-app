import type { ApiClient } from '@cherrystudio/universal/data/api/types';
import type { Painting } from '@cherrystudio/universal/data/types/painting';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { DataApiProvider } from '@/frontend/data/DataApiProvider';

import { usePaintingViewerActions } from '../usePaintingViewerActions';

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockDelete = jest.fn(async () => undefined);
const mockCreatePaintingDraftHandoff = jest.fn((_input: unknown) => 'handoff');
const mockCreatePaintingOutputAttachmentDraft = jest.fn((_output: unknown) => ({
  id: 'painting-output',
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack, push: mockRouterPush }),
}));

jest.mock('expo-media-library', () => ({
  Asset: { create: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('heroui-native/toast', () => ({
  useToast: () => ({ toast: { show: jest.fn() } }),
}));

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

jest.mock('@/frontend/features/paintings/utils/paintingDraftHandoff', () => ({
  createPaintingDraftHandoff: (input: unknown) => mockCreatePaintingDraftHandoff(input),
}));

jest.mock('@/frontend/features/paintings/utils/paintingOutputAttachment', () => ({
  createPaintingOutputAttachmentDraft: (output: unknown) =>
    mockCreatePaintingOutputAttachmentDraft(output),
}));

const painting = {
  id: '00000000-0000-7000-8000-000000000001',
  prompt: 'Draw a cherry',
} as Painting;
const dataApi = {
  delete: mockDelete,
  get: jest.fn(),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;
let queryClient: QueryClient;

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
    queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <DataApiProvider dataApi={dataApi}>
            <Probe />
          </DataApiProvider>
        </QueryClientProvider>,
      );
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

  it('removes the painting through the data endpoint before navigating back', async () => {
    await act(async () => {
      await actions?.remove();
    });

    expect(mockDelete).toHaveBeenCalledWith('/paintings', { query: { ids: [painting.id] } });
    expect(mockRouterBack).toHaveBeenCalledTimes(1);
  });
});
