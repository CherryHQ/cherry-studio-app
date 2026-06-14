import {
  filterChatInputSelectedPhotoIds,
  getChatInputSelectedPhotoOrder,
  getNextChatInputSelectedPhotoIds,
} from '../chatInputPhotoSelection';

describe('chat input photo selection', () => {
  test('builds one-based selection order', () => {
    expect(Array.from(getChatInputSelectedPhotoOrder(['photo-a', 'photo-b']))).toEqual([
      ['photo-a', 1],
      ['photo-b', 2],
    ]);
  });

  test('adds a photo when it is not selected', () => {
    expect(getNextChatInputSelectedPhotoIds(['photo-a'], 'photo-b')).toEqual([
      'photo-a',
      'photo-b',
    ]);
  });

  test('removes a photo when it is already selected', () => {
    expect(getNextChatInputSelectedPhotoIds(['photo-a', 'photo-b'], 'photo-a')).toEqual([
      'photo-b',
    ]);
  });

  test('clears selected photos when access is none', () => {
    expect(filterChatInputSelectedPhotoIds(['photo-a'], 'none', [{ id: 'photo-a' }])).toEqual([]);
  });

  test('keeps only selected photos still present in previews', () => {
    expect(
      filterChatInputSelectedPhotoIds(['photo-a', 'photo-b', 'photo-c'], 'limited', [
        { id: 'photo-c' },
        { id: 'photo-a' },
      ]),
    ).toEqual(['photo-a', 'photo-c']);
  });
});
