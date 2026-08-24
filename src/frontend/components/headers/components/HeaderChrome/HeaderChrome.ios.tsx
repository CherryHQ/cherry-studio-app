import { Stack, useIsPreview } from 'expo-router';
import { useMemo } from 'react';

import { headerScreenOptions } from '../../headerScreenOptions';
import { HeaderAction } from '../HeaderAction';
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
      {/* Expo converts left/right toolbar children before React renders them,
          so Stack.Toolbar.View must remain the direct child here. */}
      <Stack.Toolbar placement="left">
        {leftActions.map((action) => (
          <Stack.Toolbar.View hidden={action.hidden} hidesSharedBackground key={action.key}>
            <HeaderAction action={action} tone={actionTone} />
          </Stack.Toolbar.View>
        ))}
      </Stack.Toolbar>
      {rightActions && rightActions.length > 0 ? (
        <Stack.Toolbar placement="right">
          {rightActions.map((action) => (
            <Stack.Toolbar.View hidden={action.hidden} hidesSharedBackground key={action.key}>
              <HeaderAction action={action} tone={actionTone} />
            </Stack.Toolbar.View>
          ))}
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
