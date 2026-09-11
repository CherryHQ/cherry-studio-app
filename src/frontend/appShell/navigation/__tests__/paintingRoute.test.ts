import { paintingRouteId } from '../paintingRoute';

test('edits and resizes of the same painting own distinct drafts instead of reusing its task', () => {
  const task = paintingRouteId({ paintingId: 'p' });
  const edit = paintingRouteId({ paintingId: 'p', handoff: 'edit' });
  const resize = paintingRouteId({ paintingId: 'p', handoff: 'resize' });
  expect(new Set([task, edit, resize]).size).toBe(3);
  expect(paintingRouteId({ paintingId: 'p', handoff: 'edit' })).toBe(edit);
});

test('an admitted draft matches its new task notification after releasing its handoff parameter', () => {
  const draft = { paintingId: 'source', handoff: 'edit' };
  const admitted = { ...draft, handoff: undefined, paintingId: 'generated' };
  expect(paintingRouteId(admitted)).toBe(paintingRouteId({ paintingId: 'generated' }));
  expect(paintingRouteId(admitted)).not.toBe(paintingRouteId(draft));
  expect(paintingRouteId(admitted)).not.toBe(paintingRouteId({ paintingId: 'source' }));
});

test('fresh canvases have no shared identity and task ids cannot collide with draft tokens', () => {
  expect(paintingRouteId()).toBeUndefined();
  expect(paintingRouteId({ paintingId: undefined, handoff: undefined })).toBeUndefined();
  expect(paintingRouteId({ paintingId: 'same' })).not.toBe(paintingRouteId({ handoff: 'same' }));
});
