import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { FileEntrySchema } from '@/shared/data/types/file';

import { useOpenFileEntry } from '../useOpenFileEntry';

const mockPush = jest.fn();
const mockOpen = jest.fn();
const mockToast = jest.fn();

jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }));
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
  mockOpen.mockResolvedValue(undefined);
  act(() => {
    renderer = create(<Probe />);
  });
});
afterEach(() => act(() => renderer.unmount()));

it.each(['image/png', 'text/markdown', 'text/plain', 'text/html', 'application/yaml'])(
  'opens %s in-app with only the entry identity',
  (mediaType) => {
    act(() => actions.openFileEntry({ ...file, entry: { ...entry, mediaType } }));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/files/[fileEntryId]',
      params: { fileEntryId: entry.id },
    });
    expect(mockOpen).not.toHaveBeenCalled();
  },
);

it('hands unsupported documents to the platform with the original URI', async () => {
  await act(async () =>
    actions.openFileEntry({ ...file, entry: { ...entry, mediaType: 'application/pdf' } }),
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
