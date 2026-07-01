import { Stack, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from './BackHeader.types';

export type BackHeaderProps = {
  onBack?: () => void;
  rightActions?: readonly HeaderToolbarAction[];
  title?: string;
};

// react-native-screens embeds JS-rendered `headerLeft`/`headerRight` views into the
// native UINavigationBar via RNSScreenStackHeaderSubview. That bridging path exposes
// duplicate/mis-sized accessibility nodes for the back button on iOS (VoiceOver/XCUITest
// can report the header's full-screen container instead of the button's own frame), so
// the back and right-action buttons render through the native Stack.Toolbar API instead,
// matching CloseHeader's approach.
function renderHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.hidden) {
    return null;
  }

  return (
    <Stack.Toolbar.Button
      accessibilityLabel={action.accessibilityLabel}
      disabled={action.disabled}
      icon={action.icon}
      key={action.key}
      onPress={action.onPress}
      tintColor={action.tintColor}
      variant={action.variant}
    />
  );
}

export function BackHeader({ onBack, rightActions, title = '' }: BackHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }

    router.back();
  }, [onBack, router]);

  const options = useMemo(() => ({ headerBackVisible: false, title }), [title]);

  return (
    <>
      <Stack.Screen options={options} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button
          accessibilityLabel={t('navigation.back')}
          icon="chevron.backward"
          onPress={goBack}
        />
      </Stack.Toolbar>
      {rightActions && rightActions.length > 0 ? (
        <Stack.Toolbar placement="right">
          {rightActions.map((action) => renderHeaderAction(action))}
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
