import { useCallback, useMemo } from 'react';

type AutoStickInputs = {
  isFollowing(): boolean;
  stickToBottom(): void;
};

type AutoStickToBottom = {
  onContentSizeChange(): void;
};

/** Keeps the live edge exact whenever the viewport is in following mode. */
export function useAutoStickToBottom({
  isFollowing,
  stickToBottom,
}: AutoStickInputs): AutoStickToBottom {
  const onContentSizeChange = useCallback(() => {
    if (isFollowing()) {
      stickToBottom();
    }
  }, [isFollowing, stickToBottom]);

  return useMemo(() => ({ onContentSizeChange }), [onContentSizeChange]);
}
