import { createRef, type Ref, useImperativeHandle } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DevicePermissionStatus } from '@/shared/contracts/permissions';

import { useSaveImagesToPhotos } from '../useSaveImageToPhotos';

const mockPermission: DevicePermissionStatus = { state: 'granted', canAskAgain: true };
const mockPermissions = {
  getStatuses: jest.fn(async () => ({ 'photos.write': mockPermission })),
  request: jest.fn(async (_scopes: readonly string[], _signal?: AbortSignal) => ({
    'photos.write': mockPermission,
  })),
  openSystemSettings: jest.fn(async () => {}),
};
const mockCreateAsset = jest.fn(async (_uri: string) => ({}));
const mockRelease = jest.fn();
const mockPrepare = jest.fn(async ({ uri }: { uri: string }) => ({ uri, release: mockRelease }));
const mockToast = { show: jest.fn() };
const mockAlert = { confirm: jest.fn() };
const mockWatermark = () => ({ kind: 'none' });
const mockTranslate = (key: string) => key;
jest.mock('@/frontend/data', () => ({ useBackendModule: () => mockPermissions }));
jest.mock('expo-media-library', () => ({
  Asset: { create: (uri: string) => mockCreateAsset(uri) },
}));
jest.mock('../prepareImageExport', () => ({
  prepareImageExport: (source: { uri: string }) => mockPrepare(source),
}));
jest.mock('../useExportWatermark', () => ({ useExportWatermark: () => mockWatermark }));
jest.mock('@cherrystudio/ui/components', () => ({
  useToast: () => ({ toast: mockToast }),
  useAlert: () => ({ alert: mockAlert }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: mockTranslate }) }));

type SaveImages = ReturnType<typeof useSaveImagesToPhotos>;
function Probe({ ref }: { ref: Ref<SaveImages> }) {
  const save = useSaveImagesToPhotos();
  useImperativeHandle(ref, () => save, [save]);
  return null;
}
const ref = createRef<SaveImages>();
const sources = ['one.png', 'two.png', 'three.png'].map((name) => ({
  uri: `file:///${name}`,
  provenance: 'document-export' as const,
}));
let renderer: ReactTestRenderer;
beforeEach(() => {
  jest.clearAllMocks();
  mockPermissions.getStatuses.mockResolvedValue({ 'photos.write': mockPermission });
  mockCreateAsset.mockReset().mockResolvedValue({});
  act(() => {
    renderer = create(<Probe ref={ref} />);
  });
});
afterEach(() => {
  act(() => renderer.unmount());
});

test('requests add-only permission once and copies every image in order', async () => {
  mockPermissions.getStatuses.mockResolvedValueOnce({
    'photos.write': { state: 'undetermined', canAskAgain: true },
  });
  expect(await ref.current!(sources)).toBe(true);
  expect(mockPermissions.request.mock.calls).toEqual([[['photos.write'], undefined]]);
  expect(mockCreateAsset.mock.calls.flat()).toEqual(sources.map(({ uri }) => uri));
  expect(mockRelease).toHaveBeenCalledTimes(3);
  expect(mockToast.show).toHaveBeenLastCalledWith({
    label: 'imageActions.saved',
    variant: 'success',
  });
});

test('reports partial failure and retries only pages not already saved', async () => {
  mockCreateAsset.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('Photos unavailable'));
  expect(await ref.current!(sources)).toBe(false);
  expect(mockToast.show).toHaveBeenLastCalledWith({
    label: 'imageActions.savePartially',
    variant: 'danger',
  });
  expect(await ref.current!(sources)).toBe(true);
  expect(mockCreateAsset.mock.calls.flat()).toEqual([
    sources[0].uri,
    sources[1].uri,
    sources[1].uri,
    sources[2].uri,
  ]);
  expect(mockRelease).toHaveBeenCalledTimes(4);
});

test('cancellation during the final native copy suppresses success feedback', async () => {
  const controller = new AbortController();
  mockCreateAsset.mockImplementationOnce(async () => {
    controller.abort();
    return {};
  });
  expect(await ref.current!([sources[0]], controller.signal)).toBe(false);
  expect(mockCreateAsset).toHaveBeenCalledTimes(1);
  expect(mockRelease).toHaveBeenCalledTimes(1);
  expect(mockToast.show).not.toHaveBeenCalled();
});
