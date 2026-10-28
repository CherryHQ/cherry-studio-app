import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { parseChatPreviewSource } from '@/frontend/appShell/navigation/chat';
import { FileEntrySchema } from '@/shared/data/types/file';

import { useOpenFileEntry } from '../useOpenFileEntry';

const mockPush = jest.fn();
const mockOpen = jest.fn();
const mockToast = jest.fn();
const mockPrepareFileExport = jest.fn();
let mockPathname = '/files';
let mockParams: Record<string, string> = {};
let mockPane: { isAvailable: boolean; openFile: jest.Mock } | null = null;

jest.mock('@/frontend/appShell/pane/state', () => ({ useFilePane: () => mockPane }));

jest.mock('@/frontend/appShell/fileExport', () => ({
  prepareFileExport: (...args: unknown[]) => mockPrepareFileExport(...args),
  useExportWatermark: () => () => ({ kind: 'cherry', signature: { brandName: 'Cherry Studio' } }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
  usePathname: () => mockPathname,
  useLocalSearchParams: () => mockParams,
}));
jest.mock('@cherrystudio/ui/components', () => ({
  openFilePreview: (input: unknown) => mockOpen(input),
  useToast: () => ({ toast: { show: mockToast } }),
}));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

const entry = FileEntrySchema.parse({
  createdAt: 1,
  filename: 'notes.md',
  id: '00000000-0000-7000-8000-000000000001',
  mediaType: 'text/markdown',
  provenance: 'generated',
  size: 10,
  updatedAt: 2,
});
const file = { entry, uri: 'file:///managed/notes.md' };
let actions: ReturnType<typeof useOpenFileEntry>;
let renderer: ReactTestRenderer;

function Probe() {
  const currentActions = useOpenFileEntry();
  useEffect(() => {
    actions = currentActions;
  }, [currentActions]);
  return null;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockPathname = '/files';
  mockParams = {};
  mockPane = null;
  mockOpen.mockResolvedValue(undefined);
  mockPrepareFileExport.mockImplementation(async ({ entry, uri }) => ({
    uri,
    filename: entry.filename,
    mediaType: entry.mediaType,
    release() {},
  }));
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => act(() => renderer.unmount()));

it.each([
  'image/png',
  'text/markdown',
  'text/plain',
  'text/html',
  'application/yaml',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])('opens %s in-app with only the entry identity', (mediaType) => {
  act(() => actions.openFileEntry({ ...file, entry: { ...entry, mediaType } }));
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/files/[fileEntryId]',
    params: { fileEntryId: entry.id },
  });
  expect(mockOpen).not.toHaveBeenCalled();
});

it('opens a preview beside chat when the window has a file pane', () => {
  mockPathname = '/';
  mockPane = { isAvailable: true, openFile: jest.fn() };
  act(() => renderer.update(<Probe />));
  let target: string | undefined;
  act(() => {
    target = actions.openFileEntry(file);
  });
  expect(target).toBe('pane');
  expect(mockPane.openFile).toHaveBeenCalledWith({ entryId: entry.id });
  expect(mockPush).not.toHaveBeenCalled();
});

it('keeps opening the viewer page from a page above the chat', () => {
  mockPathname = '/skills';
  mockPane = { isAvailable: true, openFile: jest.fn() };
  act(() => renderer.update(<Probe />));
  act(() => actions.openFileEntry(file));
  expect(mockPane.openFile).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledWith({
    pathname: '/files/[fileEntryId]',
    params: { fileEntryId: entry.id },
  });
});

it('keeps opening the viewer page when the pane has no room beside chat', () => {
  mockPane = { isAvailable: false, openFile: jest.fn() };
  act(() => renderer.update(<Probe />));
  act(() => actions.openFileEntry(file));
  expect(mockPane.openFile).not.toHaveBeenCalled();
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it('retains the source conversation and message destination when opening a preview', () => {
  mockPathname = '/';
  mockParams = { sessionId: 'session-1', messageId: 'message-1', messageRequestId: 'visit-1' };
  act(() => renderer.update(<Probe />));
  act(() => actions.openFileEntry(file));
  expect(parseChatPreviewSource(mockPush.mock.calls[0][0].params.sourceChat)).toEqual({
    kind: 'session',
    ...mockParams,
  });
});

it('retains an unsent chat with its seeded draft and workspace', () => {
  mockPathname = '/';
  mockParams = {
    agentId: 'agent-1',
    composerHandoff: 'seed-1',
    workspaceDraftId: '00000000-0000-7000-8000-000000000002',
  };
  act(() => renderer.update(<Probe />));
  act(() => actions.openFileEntry(file));
  expect(parseChatPreviewSource(mockPush.mock.calls[0][0].params.sourceChat)).toEqual({
    kind: 'draft',
    ...mockParams,
  });
});

it('keeps the chat a library page was opened from', () => {
  mockPathname = '/library';
  mockParams = { sourceChat: JSON.stringify({ sessionId: 'session-1' }) };
  act(() => renderer.update(<Probe />));
  act(() => actions.openFileEntry(file));
  expect(parseChatPreviewSource(mockPush.mock.calls[0][0].params.sourceChat)).toEqual({
    kind: 'session',
    sessionId: 'session-1',
  });
});

it('does not treat a file-library route as a conversation', () => {
  mockParams = { sessionId: 'unrelated-route-param' };
  act(() => renderer.update(<Probe />));
  act(() => actions.openFileEntry(file));
  expect(mockPush.mock.calls[0][0].params).not.toHaveProperty('sourceChat');
});

it('hands unsupported documents to the platform with the original URI', async () => {
  await act(async () =>
    actions.openFileEntry({ ...file, entry: { ...entry, mediaType: 'application/msword' } }),
  );
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockOpen).toHaveBeenCalledWith(
    expect.objectContaining({
      file: expect.objectContaining({ uri: file.uri }),
    }),
  );
});

it('allows an explicit system open for an in-app kind and reports failures once', async () => {
  mockOpen.mockRejectedValueOnce(new Error('No handler'));
  await act(async () => actions.openFileEntryWithSystem(file));
  expect(mockPush).not.toHaveBeenCalled();
  expect(mockToast).toHaveBeenCalledTimes(1);
  expect(mockToast).toHaveBeenCalledWith({ label: 'filePreview.openFailed', variant: 'danger' });
});

it('opens the branded image copy externally while retaining the original for in-app viewing', async () => {
  const imageFile = {
    entry: FileEntrySchema.parse({ ...entry, filename: 'drawing.jpg', mediaType: 'image/jpeg' }),
    uri: 'file:///managed/drawing.jpg',
  };
  mockPrepareFileExport.mockResolvedValueOnce({
    uri: 'file:///cache/drawing.png',
    filename: 'drawing.png',
    mediaType: 'image/png',
    release() {},
  });
  await act(async () => actions.openFileEntryWithSystem(imageFile));
  expect(mockOpen).toHaveBeenCalledWith(
    expect.objectContaining({
      file: expect.objectContaining({
        uri: 'file:///cache/drawing.png',
        displayName: 'drawing.png',
        extensionLabel: 'PNG',
      }),
    }),
  );
  expect(imageFile.uri).toBe('file:///managed/drawing.jpg');
});
