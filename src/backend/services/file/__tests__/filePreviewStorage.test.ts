import { Image } from 'expo-image';

import { FileEntrySchema } from '@/shared/data/types/file';

import { imageThumbnailCacheKey } from '../filePreviewCache';
import {
  createInternalEntryWithPreview,
  getTrashedImagePreviewUri,
  resolveCachedFilePreviewUris,
  resolveFilePreviewUris,
} from '../filePreviewStorage';
import { createInternalEntry, type CreateInternalEntryInput } from '../fileStorage';

jest.mock('../fileStorage', () => ({
  ...jest.requireActual('../fileStorage'),
  createInternalEntry: jest.fn(),
}));

jest.mock('expo-image', () => ({ Image: { loadAsync: jest.fn() } }));

jest.mock('expo-file-system', () => {
  const directories = new Set<string>();
  const files = new Set<string>();
  const joinUri = (parts: (string | { uri: string })[], isDirectory: boolean) => {
    const [first, ...rest] = parts.map((part) => (typeof part === 'string' ? part : part.uri));
    let uri = first?.replace(/\/+$/, '') ?? '';
    for (const part of rest) {
      uri += `/${part.replace(/^\/+|\/+$/g, '')}`;
    }
    return isDirectory ? `${uri}/` : uri;
  };

  class MockDirectory {
    readonly uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts, true);
    }

    get exists() {
      return directories.has(this.uri);
    }

    create() {
      directories.add(this.uri);
    }
  }

  class MockFile {
    readonly uri: string;

    constructor(...parts: (string | { uri: string })[]) {
      this.uri = joinUri(parts, false);
    }

    get exists() {
      return files.has(this.uri);
    }

    delete() {
      files.delete(this.uri);
    }

    async move(destination: MockFile) {
      files.delete(this.uri);
      files.add(destination.uri);
    }
  }

  return {
    Directory: MockDirectory,
    File: MockFile,
    Paths: { cache: { uri: 'file:///cache/' }, document: { uri: 'file:///documents/' } },
    testState: { directories, files },
  };
});

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { WEBP: 'webp' },
}));

jest.mock('@/shared/core/logger/LoggerService', () => ({
  loggerService: { withContext: () => ({ warn: jest.fn() }) },
}));

const entry = FileEntrySchema.parse({
  createdAt: 1,
  filename: 'photo.jpg',
  id: '00000000-0000-7000-8000-000000000001',
  mediaType: 'image/jpeg',
  provenance: 'imported',
  size: 1024,
  updatedAt: 42,
});
const sourceUri = `file:///documents/Data/Files/${entry.id}.jpg`;
const temporaryUri = 'file:///cache/manipulator/photo.webp';
const { testState } = jest.requireMock<{
  testState: { directories: Set<string>; files: Set<string> };
}>('expo-file-system');
const { ImageManipulator } = jest.requireMock<{
  ImageManipulator: { manipulate: jest.Mock };
}>('expo-image-manipulator');

describe('filePreviewStorage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    testState.directories.clear();
    testState.files.clear();
  });

  it('reuses the retained image thumbnail for the matching deletion timestamp', async () => {
    const thumbnailUri = `file:///cache/FilePreviewImages/${imageThumbnailCacheKey(entry)}`;
    testState.files.add(sourceUri);
    testState.files.add(thumbnailUri);
    const entries = { findTrashedById: jest.fn().mockResolvedValue(entry) };

    await expect(getTrashedImagePreviewUri(entries, entry.id, 123)).resolves.toBe(thumbnailUri);
    expect(entries.findTrashedById).toHaveBeenCalledWith(entry.id, 123);
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it('falls back to retained image bytes without writing a new trash preview', async () => {
    testState.files.add(sourceUri);
    const entries = { findTrashedById: jest.fn().mockResolvedValue(entry) };

    await expect(getTrashedImagePreviewUri(entries, entry.id, 123)).resolves.toBe(sourceUri);
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it('does not expose a preview for a restored, re-deleted, or permanently removed entry', async () => {
    testState.files.add(sourceUri);
    const entries = { findTrashedById: jest.fn().mockResolvedValue(null) };

    await expect(getTrashedImagePreviewUri(entries, entry.id, 123)).resolves.toBeUndefined();
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it('keeps non-image trash on the metadata icon without parsing the file', async () => {
    const entries = {
      findTrashedById: jest.fn().mockResolvedValue({ ...entry, mediaType: 'application/pdf' }),
    };

    await expect(getTrashedImagePreviewUri(entries, entry.id, 123)).resolves.toBeUndefined();
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });

  it('generates and caches a bounded WebP thumbnail', async () => {
    testState.files.add(sourceUri);
    testState.files.add(temporaryUri);
    const sourceImage = { height: 3000, release: jest.fn(), width: 4000 };
    const outputImage = {
      release: jest.fn(),
      saveAsync: jest.fn(async () => ({ uri: temporaryUri })),
    };
    const sourceContext = { release: jest.fn(), renderAsync: jest.fn(async () => sourceImage) };
    const outputContext = {
      release: jest.fn(),
      renderAsync: jest.fn(async () => outputImage),
      resize: jest.fn(),
    };
    ImageManipulator.manipulate
      .mockReturnValueOnce(sourceContext)
      .mockReturnValueOnce(outputContext);

    expect(resolveCachedFilePreviewUris(entry)).toEqual({
      previewUri: undefined,
      uri: sourceUri,
    });

    const first = await resolveFilePreviewUris(entry);
    const second = await resolveFilePreviewUris(entry);

    expect(outputContext.resize).toHaveBeenCalledWith({ height: 384, width: 512 });
    expect(outputImage.saveAsync).toHaveBeenCalledWith({ compress: 0.78, format: 'webp' });
    expect(first).toEqual({
      previewUri: `file:///cache/FilePreviewImages/${imageThumbnailCacheKey(entry)}`,
      uri: sourceUri,
    });
    expect(second).toEqual(first);
    expect(ImageManipulator.manipulate).toHaveBeenCalledTimes(2);
  });

  it('returns the original URI when thumbnail generation fails', async () => {
    testState.files.add(sourceUri);
    const sourceContext = {
      release: jest.fn(),
      renderAsync: jest.fn(async () => {
        throw new Error('decode failed');
      }),
    };
    ImageManipulator.manipulate.mockReturnValue(sourceContext);

    await expect(resolveFilePreviewUris(entry)).resolves.toEqual({
      previewUri: sourceUri,
      uri: sourceUri,
    });
  });

  describe('new image outputs', () => {
    const generatedEntry = { ...entry, provenance: 'generated' as const };
    const input: CreateInternalEntryInput = {
      data: 'encoded-image',
      mediaType: entry.mediaType,
      provenance: 'generated',
      source: 'base64',
    };
    const entries = { create: jest.fn(), delete: jest.fn() };

    beforeEach(() => {
      jest.mocked(createInternalEntry).mockResolvedValue(generatedEntry);
      testState.files.add(sourceUri);
      ImageManipulator.manipulate.mockReturnValue({
        release: jest.fn(),
        renderAsync: jest.fn().mockRejectedValue(new Error('Thumbnail source cannot be decoded')),
      });
    });

    it('rejects an unreadable generated image and removes its entry and stored bytes', async () => {
      const error = new Error('Image cannot be decoded');
      jest.mocked(Image.loadAsync).mockRejectedValueOnce(error);

      await expect(createInternalEntryWithPreview(entries, input)).rejects.toBe(error);

      expect(entries.delete).toHaveBeenCalledWith(entry.id);
      expect(testState.files.has(sourceUri)).toBe(false);
    });

    it('keeps the original when the renderer can display it despite the thumbnail failure', async () => {
      const release = jest.fn();
      jest.mocked(Image.loadAsync).mockResolvedValueOnce({ release } as never);

      await expect(createInternalEntryWithPreview(entries, input)).resolves.toEqual(generatedEntry);

      expect(Image.loadAsync).toHaveBeenCalledWith(sourceUri, { maxHeight: 512, maxWidth: 512 });
      expect(release).toHaveBeenCalledTimes(1);
      expect(entries.delete).not.toHaveBeenCalled();
      expect(testState.files.has(sourceUri)).toBe(true);
    });

    it('uses a successful thumbnail without decoding the generated image again', async () => {
      testState.files.add(`file:///cache/FilePreviewImages/${imageThumbnailCacheKey(entry)}`);

      await expect(createInternalEntryWithPreview(entries, input)).resolves.toEqual(generatedEntry);

      expect(Image.loadAsync).not.toHaveBeenCalled();
      expect(entries.delete).not.toHaveBeenCalled();
    });

    it('preserves imported files when a thumbnail cannot be generated', async () => {
      jest.mocked(createInternalEntry).mockResolvedValueOnce(entry);

      await expect(
        createInternalEntryWithPreview(entries, {
          mediaType: entry.mediaType,
          provenance: 'imported',
          source: 'uri',
          uri: 'file:///picker/photo.jpg',
        }),
      ).resolves.toEqual(entry);

      expect(Image.loadAsync).not.toHaveBeenCalled();
      expect(entries.delete).not.toHaveBeenCalled();
      expect(testState.files.has(sourceUri)).toBe(true);
    });
  });

  it('does not thumbnail documents', async () => {
    const document = FileEntrySchema.parse({
      ...entry,
      filename: 'notes.txt',
      mediaType: 'text/plain',
      provenance: 'imported',
    });
    const documentUri = `file:///documents/Data/Files/${document.id}.txt`;
    testState.files.add(documentUri);

    await expect(resolveFilePreviewUris(document)).resolves.toEqual({
      previewUri: documentUri,
      uri: documentUri,
    });
    expect(ImageManipulator.manipulate).not.toHaveBeenCalled();
  });
});
