import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Linking } from 'react-native';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { BackendProvider } from '@/frontend/data/BackendProvider';
import { DataApiProvider } from '@/frontend/data/DataApiProvider';
import type { Backend } from '@/shared/contracts';
import type { ApiClient } from '@/shared/data/api/types';
import type { Painting } from '@/shared/data/types/painting';

import { usePaintingViewerActions } from '../usePaintingViewerActions';

const mockRouterPush = jest.fn();
const mockRouterBack = jest.fn();
const mockDelete = jest.fn(async () => undefined);
const mockCreatePaintingDraftHandoff = jest.fn((_input: unknown) => 'handoff');
const mockCreatePaintingOutputAttachmentDraft = jest.fn((_output: unknown) => ({
  id: 'painting-output',
}));
const mockAlertConfirm = jest.fn();
const mockAlertShow = jest.fn();
const mockCreateAsset = jest.fn();
const mockGetPermissions = jest.fn();
const mockRequestPermissions = jest.fn();
const mockToastShow = jest.fn();
const mockOpenSettings = jest.spyOn(Linking, 'openSettings');

jest.mock('expo-router', () => ({
  useRouter: () => ({ back: mockRouterBack, push: mockRouterPush }),
}));

jest.mock('expo-media-library', () => ({
  Asset: { create: (...args: unknown[]) => mockCreateAsset(...args) },
  getPermissionsAsync: (...args: unknown[]) => mockGetPermissions(...args),
  requestPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
}));

jest.mock('@cherrystudio/ui/components', () => ({
  useAlert: () => ({ alert: { confirm: mockAlertConfirm, show: mockAlertShow } }),
  useToast: () => ({ toast: { show: mockToastShow } }),
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
const mockCancelGeneration = jest.fn(async () => undefined);
const dataApi = {
  delete: mockDelete,
  // Deleting a painting stops any generation still writing into it, so the hook
  // now reads the painting job list; nothing is running in these cases.
  get: jest.fn(async () => []),
  patch: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
} as unknown as ApiClient;
const backend = {
  paintings: { cancelGeneration: mockCancelGeneration },
} as unknown as Backend;
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
    mockCreateAsset.mockResolvedValue(undefined);
    mockGetPermissions.mockResolvedValue({ canAskAgain: true, granted: true });
    mockOpenSettings.mockResolvedValue(undefined);
    mockRequestPermissions.mockResolvedValue({ canAskAgain: true, granted: true });
    queryClient = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity } } });
    await act(async () => {
      renderer = create(
        <QueryClientProvider client={queryClient}>
          <DataApiProvider dataApi={dataApi}>
            <BackendProvider backend={backend}>
              <Probe />
            </BackendProvider>
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
      pathname: '/paintings',
    });
  });

  it('saves immediately when write-only photo access is already granted', async () => {
    await act(async () => actions?.download());

    expect(mockGetPermissions).toHaveBeenCalledWith(true);
    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockCreateAsset).toHaveBeenCalledWith('file:///painting.png');
  });

  it('requests photo access only after Alert confirmation', async () => {
    mockGetPermissions.mockResolvedValueOnce({ canAskAgain: true, granted: false });

    await act(async () => actions?.download());

    expect(mockAlertConfirm).toHaveBeenCalledWith({
      confirmLabel: 'settings.permissions.writeAccess',
      description: 'painting.viewer.savePermissionDenied',
      onConfirm: expect.any(Function),
      title: 'settings.permissions.accessRequired',
    });
    expect(mockRequestPermissions).not.toHaveBeenCalled();

    const { onConfirm } = mockAlertConfirm.mock.calls[0][0] as {
      onConfirm: () => Promise<void>;
    };
    await act(onConfirm);

    expect(mockRequestPermissions).toHaveBeenCalledWith(true);
    expect(mockCreateAsset).toHaveBeenCalledWith('file:///painting.png');
  });

  it('offers to open system settings when photo access cannot be requested again', async () => {
    mockGetPermissions.mockResolvedValueOnce({ canAskAgain: false, granted: false });

    await act(async () => actions?.download());

    expect(mockAlertConfirm).toHaveBeenCalledWith({
      confirmLabel: 'settings.permissions.openSystemSettings',
      description: 'painting.viewer.savePermissionDenied',
      onConfirm: expect.any(Function),
      title: 'settings.permissions.accessRequired',
    });
    expect(mockRequestPermissions).not.toHaveBeenCalled();

    const { onConfirm } = mockAlertConfirm.mock.calls[0][0] as {
      onConfirm: () => Promise<void>;
    };
    await act(onConfirm);

    expect(mockOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('offers system settings when a native permission request is denied permanently', async () => {
    mockGetPermissions.mockResolvedValueOnce({ canAskAgain: true, granted: false });
    mockRequestPermissions.mockResolvedValueOnce({ canAskAgain: false, granted: false });

    await act(async () => actions?.download());
    const { onConfirm } = mockAlertConfirm.mock.calls[0][0] as {
      onConfirm: () => Promise<void>;
    };
    await act(onConfirm);

    expect(mockAlertConfirm).toHaveBeenLastCalledWith({
      confirmLabel: 'settings.permissions.openSystemSettings',
      description: 'painting.viewer.savePermissionDenied',
      onConfirm: expect.any(Function),
      title: 'settings.permissions.accessRequired',
    });
  });

  it('shows a Toast after saving to Photos', async () => {
    await act(async () => actions?.download());

    expect(mockCreateAsset).toHaveBeenCalledWith('file:///painting.png');
    expect(mockToastShow).toHaveBeenCalledWith({
      label: 'painting.viewer.saved',
      variant: 'success',
    });
  });

  it('shows an Alert when saving to Photos fails', async () => {
    mockCreateAsset.mockRejectedValueOnce(new Error('Save failed'));

    await act(async () => actions?.download());

    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'painting.viewer.saveFailed' });
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

  it('navigates back while deleting the painting through the data endpoint', async () => {
    actions?.remove();
    expect(mockRouterBack).toHaveBeenCalledTimes(1);

    await act(async () => {
      await Promise.resolve();
    });

    expect(mockDelete).toHaveBeenCalledWith('/paintings', { query: { ids: [painting.id] } });
  });

  it('restores the painting and shows an Alert when deletion fails', async () => {
    const queryKey = ['/paintings', { limit: 20 }] as const;
    queryClient.setQueryData(queryKey, {
      pageParams: [undefined],
      pages: [{ items: [painting] }],
    });
    mockDelete.mockRejectedValueOnce(new Error('delete failed'));

    actions?.remove();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(queryClient.getQueryData(queryKey)).toEqual({
      pageParams: [undefined],
      pages: [{ items: [painting] }],
    });
    expect(mockAlertShow).toHaveBeenCalledWith({ title: 'painting.viewer.deleteFailed' });
  });
});
