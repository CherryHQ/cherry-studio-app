import { Stack, useIsPreview, useRouter } from 'expo-router';
import type { ReactElement, ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { HeaderToolbarAction } from './BackHeader.types';

export type BackHeaderProps = {
  /**
   * Replaces the back button. For modes that suspend navigation — a selection's
   * "Done" — where going back would strand the mode's own state.
   */
  leftActions?: readonly HeaderToolbarAction[];
  onBack?: () => void;
  rightActions?: readonly HeaderToolbarAction[];
  title?: string;
  titleElement?: ReactElement;
};

// react-native-screens embeds JS-rendered `headerLeft`/`headerRight` views into the
// native UINavigationBar via RNSScreenStackHeaderSubview. That bridging path exposes
// duplicate/mis-sized accessibility nodes for the back button on iOS (VoiceOver/XCUITest
// can report the header's full-screen container instead of the button's own frame), so
// the back and right-action buttons render through the native Stack.Toolbar API instead,
// matching CloseHeader's approach.
function renderHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.element) {
    return (
      <Stack.Toolbar.View hidden={action.hidden} key={action.key}>
        {action.element}
      </Stack.Toolbar.View>
    );
  }

  if (action.hidden) {
    return null;
  }

  if (action.menuItems) {
    return (
      <Stack.Toolbar.Menu
        accessibilityLabel={action.accessibilityLabel}
        disabled={action.disabled}
        icon={action.icon}
        key={action.key}
      >
        {action.menuItems.map((item) => (
          <Stack.Toolbar.MenuAction
            destructive={item.destructive}
            disabled={item.disabled}
            icon={item.systemImage}
            key={item.id}
            onPress={item.onPress}
          >
            {item.label}
          </Stack.Toolbar.MenuAction>
        ))}
      </Stack.Toolbar.Menu>
    );
  }

  if (action.label) {
    return (
      <Stack.Toolbar.Button
        accessibilityLabel={action.accessibilityLabel ?? action.label}
        disabled={action.disabled}
        key={action.key}
        onPress={action.onPress}
        tintColor={action.tintColor}
        variant={action.variant}
      >
        {action.label}
      </Stack.Toolbar.Button>
    );
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

export function BackHeader({
  leftActions,
  onBack,
  rightActions,
  title = '',
  titleElement,
}: BackHeaderProps) {
  const isPreview = useIsPreview();
  const { t } = useTranslation();
  const router = useRouter();

  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }

    router.back();
  }, [onBack, router]);

  const hasTitleElement = Boolean(titleElement);
  const options = useMemo(
    () => ({ headerBackVisible: false, title: hasTitleElement ? '' : title }),
    [hasTitleElement, title],
  );

  if (isPreview) {
    return null;
  }

  return (
    <>
      <Stack.Screen options={options} />
      {titleElement ? <Stack.Title asChild>{titleElement}</Stack.Title> : null}
      <Stack.Toolbar placement="left">
        {leftActions && leftActions.length > 0 ? (
          leftActions.map((action) => renderHeaderAction(action))
        ) : (
          <Stack.Toolbar.Button
            accessibilityLabel={t('navigation.back')}
            icon="chevron.backward"
            onPress={goBack}
          />
        )}
      </Stack.Toolbar>
      {rightActions && rightActions.length > 0 ? (
        <Stack.Toolbar placement="right">
          {rightActions.map((action) => renderHeaderAction(action))}
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
