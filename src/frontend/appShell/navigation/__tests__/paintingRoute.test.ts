import { paintingRouteId } from '../paintingRoute';

test('a board opened from the gallery reuses its page and stays distinct from task pages', () => {
  expect(paintingRouteId({ boardId: 'board' })).toBe(paintingRouteId({ boardId: 'board' }));
  expect(paintingRouteId({ boardId: 'same' })).not.toBe(paintingRouteId({ paintingId: 'same' }));
});

test('a receipt rewrites the board page to the identity of its task notification', () => {
  expect(paintingRouteId({ boardId: undefined, paintingId: 'generated' })).toBe(
    paintingRouteId({ paintingId: 'generated' }),
  );
});

test('fresh canvases have no shared identity', () => {
  expect(paintingRouteId()).toBeUndefined();
  expect(paintingRouteId({ boardId: undefined, paintingId: undefined })).toBeUndefined();
});
