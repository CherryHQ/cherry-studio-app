import { useCallback } from 'react';
import type { LinkPressEvent } from 'react-native-enriched-markdown';
import { openExternalUrl } from '@/utils/openExternalUrl';

export function useMarkdownLinkPress() {
  const handleLinkPress = useCallback(({ url }: LinkPressEvent) => {
    void openExternalUrl(url);
  }, []);

  return {
    handleLinkPress,
  };
}
