import { useLayoutEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { type ChatTarget, parseChatPreviewSource } from '@/frontend/appShell/navigation/chat';
import type { ResolvedFile } from '@/shared/contracts/file';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useOpenLibraryFile } from '../useOpenLibraryFile';

const mockPush = jest.fn();
const mockGet = jest.fn();
let mockPathname = '/library';
let mockParams: Record<string, string> = {};
let mockLocalChat: ChatTarget | undefined;

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@/frontend/components/FileEntryPreview', () => ({
  useOpenFileEntry: jest.requireActual(
    '@/frontend/components/FileEntryPreview/hooks/useOpenFileEntry',
  ).useOpenFileEntry,
}));
jest.mock('@/frontend/appShell/navigation/chat', () => ({
  ...jest.requireActual('@/frontend/appShell/navigation/chat/chatRoute'),
  useChatSource: () => ({ localChat: mockLocalChat }),
}));
jest.mock('@/frontend/appShell/pane/state', () => ({
  useLibraryMasterDetail: () => null,
}));
jest.mock('@/frontend/appShell/fileExport', () => ({
  prepareSharedFile: jest.fn(),
  useExportWatermark: () => () => ({ kind: 'none' }),
}));
jest.mock('@cherrystudio/ui/components', () => ({
  openFilePreview: jest.fn(),
  useToast: () => ({ toast: { show: jest.fn() } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/frontend/data', () => ({ useApiClient: () => ({ get: mockGet }) }));
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

function file(provenance: 'generated' | 'imported', mediaType = 'image/png'): ResolvedFile {
  const filename = mediaType.startsWith('text/') ? 'notes.txt' : 'image.png';
  return {
    entry: FileEntrySchema.parse({
      createdAt: 1,
      filename,
      id: '00000000-0000-4000-8000-000000000001',
      mediaType,
      provenance,
      size: 1,
      updatedAt: 1,
    }),
    uri: `file:///${filename}`,
  };
}

let open: ReturnType<typeof useOpenLibraryFile>;
let renderer: ReactTestRenderer;
function Probe() {
  const current = useOpenLibraryFile();
  useLayoutEffect(() => {
    open = current;
  });
  return null;
}

describe('useOpenLibraryFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPathname = '/library';
    mockParams = {};
    mockLocalChat = undefined;
    act(() => {
      renderer = create(<Probe />);
    });
  });
  afterEach(() => act(() => renderer.unmount()));

  it('opens the painting board focused on an image a painting generated', async () => {
    mockGet.mockResolvedValue({ id: 'painting-1' });

    await act(() => open(file('generated')));

    expect(mockGet).toHaveBeenCalledWith(
      '/paintings/by-output/00000000-0000-4000-8000-000000000001',
    );
    expect(mockPush).toHaveBeenCalledWith({
      params: { fileEntryId: '00000000-0000-4000-8000-000000000001', paintingId: 'painting-1' },
      pathname: '/paintings',
    });
  });

  it('falls back to the file viewer when no painting owns the generated image', async () => {
    mockGet.mockResolvedValue(null);

    await act(() => open(file('generated')));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/files/[fileEntryId]',
      params: {
        fileEntryId: '00000000-0000-4000-8000-000000000001',
        imageEditRequestId: expect.any(String),
      },
    });
  });

  it('falls back to the file viewer when the lookup fails', async () => {
    mockGet.mockRejectedValue(new Error('offline'));

    await act(() => open(file('generated')));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/files/[fileEntryId]',
      params: expect.objectContaining({
        fileEntryId: '00000000-0000-4000-8000-000000000001',
      }),
    });
  });

  it('opens imported images and generated documents without asking for a painting', async () => {
    await act(() => open(file('imported')));
    await act(() => open(file('generated', 'text/plain')));

    expect(mockGet).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockPush.mock.calls[0][0].pathname).toBe('/files/[fileEntryId]');
    expect(mockPush.mock.calls[1][0].pathname).toBe('/files/[fileEntryId]');
  });

  it('carries localChat as sourceChat without sourceOrigin when opening a library file', async () => {
    mockLocalChat = { kind: 'session', sessionId: 'session-1' };
    act(() => renderer.update(<Probe />));

    await act(() => open(file('generated', 'text/plain')));

    expect(mockPush).toHaveBeenCalledTimes(1);
    const pushArg = mockPush.mock.calls[0][0];
    expect(pushArg.pathname).toBe('/files/[fileEntryId]');
    expect(parseChatPreviewSource(pushArg.params.sourceChat)).toEqual({
      kind: 'session',
      sessionId: 'session-1',
    });
    expect(pushArg.params).not.toHaveProperty('sourceOrigin');
  });

  it('omits sourceChat and sourceOrigin when no local chat is active', async () => {
    mockLocalChat = undefined;
    act(() => renderer.update(<Probe />));

    await act(() => open(file('generated', 'text/plain')));

    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/files/[fileEntryId]',
      params: { fileEntryId: '00000000-0000-4000-8000-000000000001' },
    });
    expect(mockPush.mock.calls[0][0].params).not.toHaveProperty('sourceChat');
    expect(mockPush.mock.calls[0][0].params).not.toHaveProperty('sourceOrigin');
  });
});
