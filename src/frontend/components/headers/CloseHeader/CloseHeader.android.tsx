import { XIcon } from '@cherrystudio/app-icons';
import { cn } from '@cherrystudio/ui/utils';
import { Stack, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { HeaderIconButton } from '../components/HeaderIconButton';
import type { CloseHeaderAction, CloseHeaderProps } from './CloseHeader.types';

function renderHeaderAction(action: CloseHeaderAction): ReactNode {
  if (action.hidden) {
    return null;
  }

  return (
    <Pressable
      accessibilityLabel={action.accessibilityLabel ?? action.label}
      accessibilityRole="button"
      className={cn(
        'min-h-9 items-center justify-center rounded-full px-2 active:opacity-60',
        action.disabled && 'opacity-50',
      )}
      disabled={action.disabled}
      key={action.key}
      onPress={action.onPress}
    >
      <Text className="font-semibold text-base text-foreground">{action.label}</Text>
    </Pressable>
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
      headerLeft: () => (
        <HeaderIconButton accessibilityLabel={t('common.close')} onPress={close}>
          <XIcon className="size-6 text-foreground" />
        </HeaderIconButton>
      ),
      ...(rightActions && rightActions.length > 0
        ? {
            headerRight: () => (
              <View className="flex-row items-center gap-2">
                {rightActions.map((action) => renderHeaderAction(action))}
              </View>
            ),
          }
        : null),
      headerTitleAlign: 'center' as const,
      title,
    }),
    [close, rightActions, t, title],
  );

  return <Stack.Screen options={options} />;
}
