import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import type { CloseHeaderAction, CloseHeaderProps } from './CloseHeader.types';

function renderToolbarAction(action: CloseHeaderAction) {
  if (action.hidden) {
    return null;
  }

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

export function CloseHeader({ onClose, rightActions, title = '' }: CloseHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const close = useCallback(() => {
    if (onClose) {
      onClose();
      return;
    }

    router.back();
  }, [onClose, router]);

  const options = useMemo(
    () => ({
      headerBackVisible: false,
      headerTitleAlign: 'center' as const,
      title,
    }),
    [title],
  );

  return (
    <>
      <Stack.Screen options={options} />
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button accessibilityLabel={t('common.close')} icon="xmark" onPress={close} />
      </Stack.Toolbar>
      {rightActions && rightActions.length > 0 ? (
        <Stack.Toolbar placement="right">
          {rightActions.map((action) => renderToolbarAction(action))}
        </Stack.Toolbar>
      ) : null}
    </>
  );
}
