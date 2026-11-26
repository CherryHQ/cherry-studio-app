export type FileViewerFooterActionId = 'addToChat' | 'share' | 'saveToPhotos';

export type FileViewerFooterActions = {
  primary: FileViewerFooterActionId | undefined;
  secondary: FileViewerFooterActionId | undefined;
  hasActions: boolean;
};

/**
 * Resolves up to two footer actions for the file viewer without duplicating slot logic across
 * viewers. Primary priority: addToChat -> share -> saveToPhotos -> none.
 */
export function resolveFileViewerFooterActions({
  canAddToChat,
  canShare,
  canSaveToPhotos,
}: {
  canAddToChat: boolean;
  canShare: boolean;
  canSaveToPhotos: boolean;
}): FileViewerFooterActions {
  const primary: FileViewerFooterActionId | undefined = canAddToChat
    ? 'addToChat'
    : canShare
      ? 'share'
      : canSaveToPhotos
        ? 'saveToPhotos'
        : undefined;
  const secondary: FileViewerFooterActionId | undefined =
    primary === 'addToChat' && canShare
      ? 'share'
      : canSaveToPhotos && primary !== 'saveToPhotos'
        ? 'saveToPhotos'
        : undefined;

  return {
    primary,
    secondary,
    hasActions: primary !== undefined,
  };
}
