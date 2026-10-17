import type { ResolvedFileEntry } from '@/frontend/hooks/file';
import { FileEntrySchema } from '@/shared/data/types/file';
import type { FileFolder } from '@/shared/data/types/fileLibrary';

import {
  filePickerDirectoryItems,
  filePickerItemKey,
  filePickerModifiedAt,
} from '../filePickerDirectoryItems';

const id = (n: number) => `00000000-0000-4000-8000-${n.toString().padStart(12, '0')}`;

function file(n: number, updatedAt: number): ResolvedFileEntry {
  const entry = FileEntrySchema.parse({
    id: id(n),
    filename: `${n}.txt`,
    mediaType: 'text/plain',
    provenance: 'imported',
    size: 10,
    createdAt: 1,
    updatedAt: 1,
  });
  return {
    entry,
    libraryFile: {
      id: id(n),
      folderId: null,
      name: entry.filename,
      entry,
      updatedAt,
      versionCount: 1,
    },
    uri: `file:///documents/${n}.txt`,
    previewUri: undefined,
  };
}

function folder(n: number, updatedAt: number, parentId: string | null = null): FileFolder {
  return { id: id(n), name: `Folder ${n}`, parentId, createdAt: 1, updatedAt, deletedAt: null };
}

describe('attachment picker directory ordering', () => {
  it('interleaves root folders and files by modification time without promoting child folders', () => {
    const entries = [file(1, 300), file(2, 100)];
    const folders = [folder(3, 200), folder(4, 400, id(3))];
    expect(
      filePickerDirectoryItems({ entries, folders, folderId: null, isComplete: true }).map(
        filePickerItemKey,
      ),
    ).toEqual([`file:${id(1)}`, `folder:${id(3)}`, `file:${id(2)}`]);
    expect(entries.map((item) => item.entry.id)).toEqual([id(1), id(2)]);
    expect(folders.map((item) => item.id)).toEqual([id(3), id(4)]);
  });

  it('uses the logical timestamp, including metadata changes, rather than the content revision', () => {
    const renamed = file(1, 300);
    expect(renamed.entry.updatedAt).toBe(1);
    expect(filePickerModifiedAt(renamed)).toBe(300);
    expect(
      filePickerDirectoryItems({
        entries: [renamed],
        folders: [folder(2, 200)],
        folderId: null,
        isComplete: true,
      }).map(filePickerItemKey),
    ).toEqual([`file:${id(1)}`, `folder:${id(2)}`]);
  });

  it('holds older and equal-time folders until paging passes their time', () => {
    const folders = [folder(3, 600), folder(4, 300), folder(5, 200)];
    const entries = [file(1, 500), file(2, 300)];
    expect(
      filePickerDirectoryItems({ entries, folders, folderId: null, isComplete: false }).map(
        filePickerItemKey,
      ),
    ).toEqual([`folder:${id(3)}`, `file:${id(1)}`, `file:${id(2)}`]);

    expect(
      filePickerDirectoryItems({
        entries: [...entries, file(6, 100)],
        folders,
        folderId: null,
        isComplete: true,
      }).map(filePickerItemKey),
    ).toEqual([
      `folder:${id(3)}`,
      `file:${id(1)}`,
      `folder:${id(4)}`,
      `file:${id(2)}`,
      `folder:${id(5)}`,
      `file:${id(6)}`,
    ]);
  });

  it('shows an empty directory’s child folders once its file query completes', () => {
    const folders = [folder(1, 100), folder(2, 200, id(1)), folder(3, 300, id(1))];
    expect(
      filePickerDirectoryItems({ entries: [], folders, folderId: id(1), isComplete: false }),
    ).toEqual([]);
    expect(
      filePickerDirectoryItems({ entries: [], folders, folderId: id(1), isComplete: true }).map(
        filePickerItemKey,
      ),
    ).toEqual([`folder:${id(3)}`, `folder:${id(2)}`]);
  });
});
