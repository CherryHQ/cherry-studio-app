import { validateFileLibraryReferences } from '../fileLibraryValidation';

const folder = {
  id: 'folder',
  parent_id: null,
  name: 'Reports',
  name_key: 'reports',
  deleted_at: null,
  trashed_with: null,
};
const file = {
  id: 'file',
  folder_id: 'folder',
  name: 'Notes.md',
  name_key: 'notes.md',
  current_entry_id: 'entry',
  deleted_at: null,
  trashed_with: null,
};
const version = { id: 'entry', library_file_id: 'file', deleted_at: null, trashed_with: null };
const valid = () => ({
  folders: [{ ...folder }],
  files: [{ ...file }],
  versions: [{ ...version }],
});

describe('file-library backup validation', () => {
  it('accepts coherent references and legacy duplicate root names', () => {
    expect(() => validateFileLibraryReferences(valid())).not.toThrow();
    expect(() =>
      validateFileLibraryReferences({
        folders: [],
        files: [
          { ...file, folder_id: null },
          { ...file, folder_id: null, id: 'second', current_entry_id: 'second-entry' },
        ],
        versions: [version, { ...version, id: 'second-entry', library_file_id: 'second' }],
      }),
    ).not.toThrow();
  });
  it.each([
    { ...valid(), folders: [{ ...folder, parent_id: 'folder' }] },
    { ...valid(), files: [{ ...file, folder_id: 'missing' }] },
    { ...valid(), files: [{ ...file, current_entry_id: 'missing' }] },
    { ...valid(), versions: [{ ...version, library_file_id: 'missing' }] },
    { ...valid(), versions: [{ ...version, deleted_at: 2 }] },
    { ...valid(), folders: [{ ...folder, name: '../escape' }] },
    { ...valid(), folders: [{ ...folder, deleted_at: 2 }] },
    { ...valid(), versions: [{ ...version, deleted_at: 2, trashed_with: 'missing' }] },
  ])('rejects broken ancestry, lineage, or trash membership', (input) => {
    expect(() => validateFileLibraryReferences(input)).toThrow('Invalid file-library references');
  });
});
