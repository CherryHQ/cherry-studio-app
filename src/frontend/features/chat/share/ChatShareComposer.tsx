import { Button } from '@cherrystudio/ui/components';
import type { PropsWithChildren } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useChatShareSelection } from './ChatShareSelectionProvider';

/** Keeps the managed composer mounted while selection controls occupy its place. */
export function ChatShareComposer({ children }: PropsWithChildren) {
  const { t } = useTranslation();
  const { bottom } = useSafeAreaInsets();
  const { isSelecting, isSharing, selectedIds, cancelSelection, confirmSelection } =
    useChatShareSelection();

  return (
    <>
      <View style={isSelecting ? { display: 'none' } : undefined}>{children}</View>
      {isSelecting ? (
        <View
          className="flex-row items-center gap-3 bg-chat-background px-4 pt-3"
          style={{ paddingBottom: Math.max(bottom, 12) }}
          testID="chat-share-selection-toolbar"
        >
          <Button onPress={cancelSelection} variant="ghost" testID="chat-share-cancel">
            {t('common.cancel')}
          </Button>
          <Text
            className="min-w-0 flex-1 text-center text-muted-foreground text-sm"
            accessibilityLiveRegion="polite"
          >
            {selectedIds.size
              ? t('common.selection.count', { count: selectedIds.size })
              : t('chat.share.selectMessages')}
          </Text>
          <Button
            disabled={!selectedIds.size || isSharing}
            loading={isSharing}
            onPress={confirmSelection}
            testID="chat-share-confirm"
          >
            {t('common.confirm')}
          </Button>
        </View>
      ) : null}
    </>
  );
}
