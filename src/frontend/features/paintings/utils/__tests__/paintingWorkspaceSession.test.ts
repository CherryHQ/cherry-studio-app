import {
  editPaintingWorkspace,
  hasPaintingWorkspace,
  registerPaintingWorkspace,
} from '../paintingWorkspaceSession';

it('delivers an edit only to its mounted source workspace and stops on close', () => {
  const first = jest.fn();
  const second = jest.fn();
  const closeFirst = registerPaintingWorkspace('first', first);
  const closeSecond = registerPaintingWorkspace('second', second);
  const request = { output: { fileEntryId: 'photo', uri: 'file:///photo.png' } };
  try {
    expect(editPaintingWorkspace('first', request)).toBe(true);
    expect(first).toHaveBeenCalledWith(request);
    expect(second).not.toHaveBeenCalled();
    closeFirst();
    expect(hasPaintingWorkspace('first')).toBe(false);
    expect(editPaintingWorkspace('first', request)).toBe(false);
    expect(editPaintingWorkspace(undefined, request)).toBe(false);
    expect(hasPaintingWorkspace('second')).toBe(true);
  } finally {
    closeFirst();
    closeSecond();
  }
});
