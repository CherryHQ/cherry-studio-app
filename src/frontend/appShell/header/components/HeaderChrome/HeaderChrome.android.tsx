import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { headerScreenOptions, mainHeaderRowHeight } from '../../headerScreenOptions';
import { HeaderActionGroup } from '../HeaderActionGroup/HeaderActionGroup';
import type { HeaderChromeProps } from './HeaderChrome.types';

/** Mounts the shared header contract through Android native-stack options. */
export function HeaderChrome({
  actionTone,
  leftActions,
  rightActions,
  title = '',
  titleAlign,
  titleElement,
}: HeaderChromeProps) {
  const leftContent = useMemo(
    () => <HeaderActionGroup actions={leftActions} placement="left" tone={actionTone} />,
    [actionTone, leftActions],
  );
  const rightContent = useMemo(
    () =>
      rightActions && rightActions.length > 0 ? (
        <HeaderActionGroup actions={rightActions} placement="right" tone={actionTone} />
      ) : undefined,
    [actionTone, rightActions],
  );
  const options = useMemo(
    () => ({
      ...headerScreenOptions,
      headerLeft: () => leftContent,
      headerRight: rightContent ? () => rightContent : undefined,
      // The toolbar hands a custom title the full bar height and lays its content out from the
      // top, so a title shorter than the bar has to centre itself against the bar's action buttons.
      headerTitle: titleElement
        ? () => (
            <View style={{ height: mainHeaderRowHeight, justifyContent: 'center' }}>
              {titleElement}
            </View>
          )
        : undefined,
      headerTitleAlign: titleAlign,
      title: titleElement ? '' : title,
    }),
    [leftContent, rightContent, title, titleAlign, titleElement],
  );

  return <Stack.Screen options={options} />;
}
