import { Stack } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { headerScreenOptions } from '../../headerScreenOptions';
import { HeaderAction } from '../HeaderAction';
import type { HeaderChromeProps } from './HeaderChrome.types';

/** Mounts the shared header contract through Android native-stack options. */
export function HeaderChrome({
  leftActions,
  rightActions,
  title = '',
  titleAlign,
  titleElement,
}: HeaderChromeProps) {
  const leftContent = useMemo(
    () => (
      <View className="flex-row items-center gap-2">
        {leftActions.map((action) => (
          <HeaderAction action={action} key={action.key} />
        ))}
      </View>
    ),
    [leftActions],
  );
  const rightContent = useMemo(
    () =>
      rightActions && rightActions.length > 0 ? (
        <View className="flex-row items-center gap-2">
          {rightActions.map((action) => (
            <HeaderAction action={action} key={action.key} />
          ))}
        </View>
      ) : undefined,
    [rightActions],
  );
  const options = useMemo(
    () => ({
      ...headerScreenOptions,
      headerLeft: () => leftContent,
      headerRight: rightContent ? () => rightContent : undefined,
      headerTitle: titleElement ? () => titleElement : undefined,
      headerTitleAlign: titleAlign,
      title: titleElement ? '' : title,
    }),
    [leftContent, rightContent, title, titleAlign, titleElement],
  );

  return <Stack.Screen options={options} />;
}
