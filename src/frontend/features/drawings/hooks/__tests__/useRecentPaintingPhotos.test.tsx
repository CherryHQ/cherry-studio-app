import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import type { DevicePermissionStatus } from '@/shared/contracts';

import { useRecentPaintingPhotos } from '../useRecentPaintingPhotos';

type HookResult = ReturnType<typeof useRecentPaintingPhotos>;

const mockAddListener = jest.fn();
const mockRemove = jest.fn();
const mockGetStatuses = jest.fn();
const mockRequest = jest.fn();
const mockLoadPhotoPreviewPage = jest.fn();

jest.mock('expo-media-library', () => ({
  addListener: (listener: () => void) => mockAddListener(listener),
}));

// Backend modules are stable singletons.
const mockPermissions = {
  getStatuses: (...args: unknown[]) => mockGetStatuses(...args),
  request: (...args: unknown[]) => mockRequest(...args),
};
jest.mock('@/frontend/data', () => ({
  useBackendModule: () => mockPermissions,
}));

jest.mock('../../utils/photoLibrary', () => ({
  ...jest.requireActual('../../utils/photoLibrary'),
  loadPhotoPreviewPage: (offset: number, limit: number) => mockLoadPhotoPreviewPage(offset, limit),
}));

let renderer: ReactTestRenderer | undefined;
const latest: { current?: HookResult } = {};

function Probe() {
  const result = useRecentPaintingPhotos(true);
  useEffect(() => {
    latest.current = result;
  }, [result]);
  return null;
}

async function mount() {
  await act(async () => {
    renderer = create(<Probe />);
  });
  return () => latest.current!;
}

function withPermission(status: DevicePermissionStatus) {
  mockGetStatuses.mockResolvedValue({ 'photos.read': status });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockAddListener.mockReturnValue({ remove: mockRemove });
  mockLoadPhotoPreviewPage.mockResolvedValue({
    hasNextPhotoPage: false,
    nextOffset: 1,
    photoPreviews: [{ fileName: 'a.jpg', id: 'ph://a', uri: 'ph://a' }],
  });
});

afterEach(async () => {
  await act(async () => {
    renderer?.unmount();
  });
  renderer = undefined;
});

it('does not observe the photo library before access is granted', async () => {
  withPermission({ canAskAgain: true, state: 'undetermined' });

  const result = await mount();

  expect(result().isLoading).toBe(false);
  expect(mockAddListener).not.toHaveBeenCalled();
  expect(mockLoadPhotoPreviewPage).not.toHaveBeenCalled();
});

it('observes the library once the user grants access, and stops on unmount', async () => {
  withPermission({ canAskAgain: true, state: 'undetermined' });
  mockRequest.mockResolvedValue({ 'photos.read': { canAskAgain: true, state: 'granted' } });
  const result = await mount();

  await act(async () => {
    await expect(result().requestAccess()).resolves.toBe('granted');
  });

  expect(mockLoadPhotoPreviewPage).toHaveBeenCalledWith(0, 12);
  expect(result().photos).toHaveLength(1);
  expect(mockAddListener).toHaveBeenCalledTimes(1);

  await act(async () => {
    renderer?.unmount();
  });
  renderer = undefined;
  expect(mockRemove).toHaveBeenCalledTimes(1);
});

it('observes immediately when limited access already exists', async () => {
  withPermission({ canAskAgain: true, state: 'limited' });

  await mount();

  expect(mockAddListener).toHaveBeenCalledTimes(1);
});
