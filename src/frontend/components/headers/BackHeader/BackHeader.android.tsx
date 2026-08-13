import { cn } from '@cherrystudio/ui/utils';
import { Stack, useRouter } from 'expo-router';
import { ChevronLeftIcon } from 'lucide-uniwind/png';
import { Fragment, type ReactElement, type ReactNode, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text } from 'react-native';

import { HeaderIconButton } from '../components/HeaderIconButton';
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

function renderAndroidHeaderAction(action: HeaderToolbarAction): ReactNode {
  if (action.hidden) {
    return null;
  }

  if (action.element) {
    return <Fragment key={action.key}>{action.element}</Fragment>;
  }

  if (action.label) {
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

  if (!action.androidIcon) {
    return null;
  }

  const AndroidIcon = action.androidIcon;

  return (
    <HeaderIconButton
      accessibilityLabel={action.accessibilityLabel ?? ''}
      disabled={action.disabled}
      key={action.key}
      onPress={action.onPress}
    >
      <AndroidIcon className="size-6 text-foreground" strokeWidth={2} />
    </HeaderIconButton>
  );
}

export function BackHeader({
  leftActions,
  onBack,
  rightActions,
  title = '',
  titleElement,
}: BackHeaderProps) {
  const { t } = useTranslation();
  const router = useRouter();

  const goBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }

    router.back();
  }, [onBack, router]);

  const options = useMemo(
    () => ({
      headerBackVisible: false,
      headerLeft:
        leftActions && leftActions.length > 0
          ? () => leftActions.map((action) => renderAndroidHeaderAction(action))
          : () => (
              <HeaderIconButton accessibilityLabel={t('navigation.back')} onPress={goBack}>
                <ChevronLeftIcon className="size-6 text-foreground" strokeWidth={2} />
              </HeaderIconButton>
            ),
      headerRight:
        rightActions && rightActions.length > 0
          ? () => rightActions.map((action) => renderAndroidHeaderAction(action))
          : undefined,
      headerTitle: titleElement ? () => titleElement : undefined,
      title: titleElement ? '' : title,
    }),
    [goBack, leftActions, rightActions, t, title, titleElement],
  );

  return <Stack.Screen options={options} />;
}
