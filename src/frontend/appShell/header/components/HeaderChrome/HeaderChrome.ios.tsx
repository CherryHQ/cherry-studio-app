import { Stack, useIsPreview } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { usePaneChrome } from '@/frontend/appShell/layout';
import { isLiquidGlassAvailable } from '@/frontend/utils/constants';

import { headerScreenOptions } from '../../headerScreenOptions';
import { HeaderAction } from '../HeaderAction';
import { HeaderActionGroup } from '../HeaderActionGroup/HeaderActionGroup';
import type { HeaderChromeProps } from './HeaderChrome.types';
import { InlineHeaderChrome } from './InlineHeaderChrome';

/** Mounts the shared header contract through iOS native toolbar slots, or inline in a pane. */
export function HeaderChrome(props: HeaderChromeProps) {
  return usePaneChrome() ? <InlineHeaderChrome {...props} /> : <NativeHeaderChrome {...props} />;
}

function NativeHeaderChrome({
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

  const actionSurfaceClassName = isLiquidGlassAvailable
    ? undefined
    : actionTone === 'inverse'
      ? 'rounded-full bg-constant-black/55'
      : 'rounded-full bg-card/70';

  return (
    <>
      <Stack.Screen options={options} />
      {titleElement && titleAlign === 'left' ? (
        // iOS centers Stack.Title; leading titles share the toolbar with the back action.
        <Stack.Toolbar placement="left">
          {leftActions.map((action) => (
            <Stack.Toolbar.View key={action.key}>
              <View className={actionSurfaceClassName}>
                <HeaderAction action={action} tone={actionTone} />
              </View>
            </Stack.Toolbar.View>
          ))}
          <Stack.Toolbar.Spacer hidden={leftActions.length === 0} width={4} />
          <Stack.Toolbar.View>{titleElement}</Stack.Toolbar.View>
        </Stack.Toolbar>
      ) : (
        <>
          {titleElement ? <Stack.Title asChild>{titleElement}</Stack.Title> : null}
          <HeaderActionGroup actions={leftActions} placement="left" tone={actionTone} />
        </>
      )}
      {rightActions && rightActions.length > 0 ? (
        <HeaderActionGroup actions={rightActions} placement="right" tone={actionTone} />
      ) : null}
    </>
  );
}
