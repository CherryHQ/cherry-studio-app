import { readFileSync } from 'node:fs';

import type { FilePreviewFile } from '../file-preview.types';
import { openFilePreview as openOnAndroid } from '../utils/open-file/open-file.android';
import { openFilePreview as openOnIos } from '../utils/open-file/open-file.ios';

const mockPreviewFile = jest.fn();

jest.mock('@magrinj/expo-quick-look', () => ({
  __esModule: true,
  default: { previewFile: (input: unknown) => mockPreviewFile(input) },
}));

const file: FilePreviewFile = {
  displayName: 'brief.pdf',
  extensionLabel: 'PDF',
  id: 'file-1',
  kind: 'pdf',
  revision: 42,
  uri: 'file:///documents/brief.pdf',
};
const labels = { openWith: 'Open with', unavailable: 'Unavailable' };

describe('openFilePreview', () => {
  beforeEach(() => {
    mockPreviewFile.mockReset();
    mockPreviewFile.mockResolvedValue(undefined);
  });

  it('presents read-only Quick Look on iOS', async () => {
    await openOnIos({ file, labels });

    expect(mockPreviewFile).toHaveBeenCalledWith({
      editingMode: 'disabled',
      title: 'brief.pdf',
      uri: 'file:///documents/brief.pdf',
    });
  });

  it('titles the Android chooser with the localized label', async () => {
    await openOnAndroid({ file, labels });

    expect(mockPreviewFile).toHaveBeenCalledWith({
      chooserTitle: 'Open with',
      uri: 'file:///documents/brief.pdf',
    });
  });

  it('rejects so the caller can report the failed open', async () => {
    const error = new Error('open failed');
    mockPreviewFile.mockRejectedValue(error);

    await expect(openOnIos({ file, labels })).rejects.toBe(error);
  });

  it('keeps the iOS display-title bridge in the upstream Quick Look patch', () => {
    const patch = readFileSync(
      `${process.cwd()}/patches/@magrinj__expo-quick-look@0.3.1.patch`,
      'utf8',
    );

    expect(patch).toContain('@Field var title: String?');
    expect(patch).toContain('PreviewItem(url: fileURL, title: options.title)');
    expect(patch).toContain('title?: string;');
  });
});
