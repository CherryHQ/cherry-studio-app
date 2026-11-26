import { resolveFileViewerFooterActions } from '../fileViewerFooterActions';

describe('resolveFileViewerFooterActions', () => {
  it.each([
    [
      { canAddToChat: false, canShare: false, canSaveToPhotos: false },
      { primary: undefined, secondary: undefined, hasActions: false },
    ],
    [
      { canAddToChat: false, canShare: false, canSaveToPhotos: true },
      { primary: 'saveToPhotos', secondary: undefined, hasActions: true },
    ],
    [
      { canAddToChat: false, canShare: true, canSaveToPhotos: false },
      { primary: 'share', secondary: undefined, hasActions: true },
    ],
    [
      { canAddToChat: false, canShare: true, canSaveToPhotos: true },
      { primary: 'share', secondary: 'saveToPhotos', hasActions: true },
    ],
    [
      { canAddToChat: true, canShare: false, canSaveToPhotos: false },
      { primary: 'addToChat', secondary: undefined, hasActions: true },
    ],
    [
      { canAddToChat: true, canShare: false, canSaveToPhotos: true },
      { primary: 'addToChat', secondary: 'saveToPhotos', hasActions: true },
    ],
    [
      { canAddToChat: true, canShare: true, canSaveToPhotos: false },
      { primary: 'addToChat', secondary: 'share', hasActions: true },
    ],
    [
      { canAddToChat: true, canShare: true, canSaveToPhotos: true },
      { primary: 'addToChat', secondary: 'share', hasActions: true },
    ],
  ] as const)('resolves %j', (input, expected) => {
    expect(resolveFileViewerFooterActions(input)).toEqual(expected);
  });
});
