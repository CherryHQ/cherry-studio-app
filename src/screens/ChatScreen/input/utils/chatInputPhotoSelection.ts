type ChatInputPhotoAccess = 'all' | 'limited' | 'none';

type ChatInputPhotoPreview = {
  id: string;
};

export function getChatInputSelectedPhotoOrder(selectedPhotoIds: readonly string[]) {
  const order = new Map<string, number>();
  selectedPhotoIds.forEach((photoId, index) => {
    order.set(photoId, index + 1);
  });

  return order;
}

export function getNextChatInputSelectedPhotoIds(
  selectedPhotoIds: readonly string[],
  photoId: string,
) {
  if (selectedPhotoIds.includes(photoId)) {
    return selectedPhotoIds.filter((selectedPhotoId) => selectedPhotoId !== photoId);
  }

  return [...selectedPhotoIds, photoId];
}

export function filterChatInputSelectedPhotoIds(
  selectedPhotoIds: readonly string[],
  photoAccess: ChatInputPhotoAccess,
  photoPreviews: readonly ChatInputPhotoPreview[],
) {
  if (photoAccess === 'none') {
    return [];
  }

  const previewIds = new Set(photoPreviews.map((preview) => preview.id));

  return selectedPhotoIds.filter((photoId) => previewIds.has(photoId));
}
