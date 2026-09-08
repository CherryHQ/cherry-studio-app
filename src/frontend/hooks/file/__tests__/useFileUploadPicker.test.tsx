import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { type FileUploadSelection, useFileUploadPicker } from '../useFileUploadPicker';

const mockGetDocument = jest.fn();
let pickFiles: ReturnType<typeof useFileUploadPicker> | undefined;
let renderer: ReactTestRenderer | undefined;

jest.mock('expo-document-picker', () => ({
  getDocumentAsync: (...args: unknown[]) => mockGetDocument(...args),
}));

describe('useFileUploadPicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    pickFiles = undefined;
  });

  afterEach(() => {
    act(() => renderer?.unmount());
    renderer = undefined;
  });

  it('opens the shared multi-file picker and normalizes its selections', async () => {
    mockGetDocument.mockResolvedValue({
      assets: [
        {
          lastModified: 1_757_241_600_000,
          mimeType: 'application/pdf',
          name: 'notes.pdf',
          size: 512,
          uri: 'file:///source/notes.pdf',
        },
        {
          lastModified: 1_757_241_600_001,
          name: 'plain.txt',
          uri: 'file:///source/plain.txt',
        },
      ],
      canceled: false,
    });
    renderHook();

    let selections: FileUploadSelection[] | undefined;
    await act(async () => {
      selections = await getPicker()();
    });

    expect(mockGetDocument).toHaveBeenCalledWith({
      copyToCacheDirectory: true,
      multiple: true,
      type: '*/*',
    });
    expect(selections).toEqual([
      {
        mediaType: 'application/pdf',
        name: 'notes.pdf',
        size: 512,
        uri: 'file:///source/notes.pdf',
      },
      {
        name: 'plain.txt',
        uri: 'file:///source/plain.txt',
      },
    ]);
  });

  it('returns no selections when the system picker is cancelled', async () => {
    mockGetDocument.mockResolvedValue({ canceled: true });
    renderHook();

    let selections: FileUploadSelection[] | undefined;
    await act(async () => {
      selections = await getPicker()();
    });

    expect(selections).toEqual([]);
  });
});

function Probe() {
  const picker = useFileUploadPicker();

  useEffect(() => {
    pickFiles = picker;
  }, [picker]);

  return null;
}

function renderHook() {
  act(() => {
    renderer = create(<Probe />);
  });
}

function getPicker() {
  if (!pickFiles) {
    throw new Error('File upload picker did not mount');
  }

  return pickFiles;
}
