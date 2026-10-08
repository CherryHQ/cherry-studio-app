import { paintingRouteId, paintingViewerRouteId } from '../paintingRoute';

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

test('a viewer is identified by its output, so reopening that output cannot stack another page', () => {
  const output = paintingViewerRouteId({ fileEntryId: 'f1', paintingId: 'p' });
  expect(paintingViewerRouteId({ fileEntryId: ['f1'], paintingId: 'p' })).toBe(output);
  expect(paintingViewerRouteId({ fileEntryId: 'f2', paintingId: 'p' })).not.toBe(output);
  // The output-less legacy path redirects to the task page instead of claiming a viewer identity.
  expect(paintingViewerRouteId({ paintingId: 'p' })).toBeUndefined();
});
