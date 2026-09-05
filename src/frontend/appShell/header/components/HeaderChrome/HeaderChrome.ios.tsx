import { Stack, useIsPreview } from 'expo-router';
import { useMemo } from 'react';

import { headerScreenOptions } from '../../headerScreenOptions';
import { HeaderActionGroup } from '../HeaderActionGroup/HeaderActionGroup';
import type { HeaderChromeProps } from './HeaderChrome.types';

/** Mounts the shared header contract through iOS native toolbar slots. */
export function HeaderChrome({
  actionTone,
  leftActions,
  rightActions,
  title = '',
  titleAlign,
  titleElement,
}: HeaderChromeProps) {
  const isPreview = useIsPreview();
  const options = useMemo(
    () => ({
      ...headerScreenOptions,
      headerTitleAlign: titleAlign,
      title: titleElement ? '' : title,
    }),
    [title, titleAlign, titleElement],
  );

  if (isPreview) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={options} />
      {titleElement ? <Stack.Title asChild>{titleElement}</Stack.Title> : null}
      <HeaderActionGroup actions={leftActions} placement="left" tone={actionTone} />
      {rightActions && rightActions.length > 0 ? (
        <HeaderActionGroup actions={rightActions} placement="right" tone={actionTone} />
      ) : null}
    </>
  );
}
