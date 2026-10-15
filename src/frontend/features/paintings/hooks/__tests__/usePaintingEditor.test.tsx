import { useEffect } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { usePaintingEditor } from '../usePaintingEditor';

const photo = { id: 'photo:album-1', uri: 'file:///album.jpg' };
const imported = { ...photo, fileEntryId: 'managed-photo', uri: 'file:///managed.jpg' };
const notes = [{ id: 1, x: 0.3, y: 0.4, text: 'Make the cup blue' }];
let editor: ReturnType<typeof usePaintingEditor>;
function Probe() {
  const current = usePaintingEditor(photo);
  useEffect(() => {
    editor = current;
  }, [current]);
  return null;
}

describe('painting editor drafts', () => {
  let renderer: ReactTestRenderer;
  beforeEach(() =>
    act(() => {
      renderer = create(<Probe />);
    }),
  );
  afterEach(() => act(() => renderer.unmount()));

  it('restores album annotations after returning to the composer and completing import', () => {
    act(() => {
      editor.saveAnnotations(notes);
      editor.close();
    });
    expect(editor.isOpen).toBe(false);
    // A regular composer send must retain these instructions even without reopening the editor.
    expect(editor.getAnnotations(imported)).toEqual(notes);
    act(() => editor.open(imported));
    expect(editor.isOpen).toBe(true);
    expect(editor.initialAnnotations).toEqual(notes);
    // Later entry points identify the same image by its managed file, not its album id.
    act(() => {
      editor.saveAnnotations(notes);
      editor.close();
    });
    act(() => editor.open({ fileEntryId: imported.fileEntryId, uri: imported.uri }));
    expect(editor.initialAnnotations).toEqual(notes);
  });

  it('keeps notes with their source when editing a different version and returning', () => {
    act(() => editor.open(imported));
    act(() => editor.saveAnnotations(notes));
    act(() => editor.open({ fileEntryId: 'other', uri: 'file:///other.jpg' }));
    expect(editor.initialAnnotations).toEqual([]);
    act(() => editor.open(imported));
    expect(editor.initialAnnotations).toEqual(notes);
    act(() => editor.saveAnnotations([]));
    act(() => {
      editor.close();
      editor.open(imported);
    });
    expect(editor.initialAnnotations).toEqual([]);
  });
});
