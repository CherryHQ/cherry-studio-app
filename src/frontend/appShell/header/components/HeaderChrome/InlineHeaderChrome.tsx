import { Text, View } from 'react-native';

import { usePaneChrome } from '@/frontend/appShell/layout';

import { mainHeaderRowHeight } from '../../headerScreenOptions';
import { InlineHeaderActionGroup } from '../HeaderActionGroup/InlineHeaderActionGroup';
import type { HeaderChromeProps } from './HeaderChrome.types';

const NO_ACTIONS: HeaderChromeProps['leftActions'] = [];

/** Lays the shared header contract out as an ordinary row at the top of a pane. */
export function InlineHeaderChrome({
  actionTone,
  leftActions,
  rightActions = NO_ACTIONS,
  title = '',
  titleElement,
}: HeaderChromeProps) {
  const paneAction = usePaneChrome()?.headerAction;
  const trailingActions = paneAction ? [paneAction, ...rightActions] : rightActions;

  return (
    <View className="flex-row items-center px-4" style={{ height: mainHeaderRowHeight }}>
      {/* Equal flexible sides keep the title centered over the pane. */}
      <View className="flex-1 flex-row items-center justify-start">
        <InlineHeaderActionGroup actions={leftActions} placement="left" tone={actionTone} />
      </View>
      <View accessibilityRole="header" className="shrink items-center">
        {titleElement ?? (
          <Text className="font-semibold text-base text-foreground" numberOfLines={1}>
            {title}
          </Text>
        )}
      </View>
      <View className="flex-1 flex-row items-center justify-end">
        <InlineHeaderActionGroup actions={trailingActions} placement="right" tone={actionTone} />
      </View>
    </View>
  );
}
