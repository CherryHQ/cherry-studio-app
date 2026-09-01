import { Stack } from 'expo-router';
import { useMemo } from 'react';

import { headerScreenOptions } from '../../headerScreenOptions';
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
      headerTitle: titleElement ? () => titleElement : undefined,
      headerTitleAlign: titleAlign,
      title: titleElement ? '' : title,
    }),
    [leftContent, rightContent, title, titleAlign, titleElement],
  );

  return <Stack.Screen options={options} />;
}
