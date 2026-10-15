import EllipsisIcon from '@cherrystudio/app-icons/icons/ellipsis';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import {
  HeaderChrome,
  type HeaderToolbarAction,
  useRouteHeaderLeadingAction,
} from '@/frontend/appShell/header';

/** Overview chrome: back, the board's name and size, and board-level actions. */
export function PaintingOverviewChrome({
  nodeCount,
  onBack,
  onDelete,
  onRename,
  title,
}: {
  nodeCount: number;
  onBack: () => void;
  onDelete: () => void;
  onRename: () => void;
  title: string;
}) {
  const { t } = useTranslation();
  const leadingAction = useRouteHeaderLeadingAction(onBack);
  const leftActions = useMemo(() => [leadingAction], [leadingAction]);
  const rightActions = useMemo<HeaderToolbarAction[]>(
    () => [
      {
        accessibilityLabel: t('painting.board.more'),
        icon: EllipsisIcon,
        items: [
          { id: 'rename', label: t('painting.board.rename'), onPress: onRename },
          {
            destructive: true,
            group: 'delete',
            id: 'delete',
            label: t('painting.board.delete'),
            onPress: onDelete,
          },
        ],
        key: 'more',
        type: 'menu',
      },
    ],
    [onDelete, onRename, t],
  );

  return (
    <HeaderChrome
      actionTone="inverse"
      leftActions={leftActions}
      rightActions={rightActions}
      titleElement={
        <View accessibilityRole="header" accessible className="max-w-56 items-center">
          <Text className="font-semibold text-base text-constant-white" numberOfLines={1}>
            {title}
          </Text>
          <Text className="text-constant-white/55 text-xs">
            {t('painting.board.nodeCount', { count: nodeCount })}
          </Text>
        </View>
      }
    />
  );
}
