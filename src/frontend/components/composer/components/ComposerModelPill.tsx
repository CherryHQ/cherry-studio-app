import { Composer } from '@cherrystudio/ui/components';
import type { IconSource } from '@cherrystudio/ui/icons';
import { type PropsWithChildren, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';
import { useUniwind } from 'uniwind';

import { Image } from '@/frontend/components/nativePrimitives';

import { useComposerFieldDismiss } from '../hooks/useComposerFieldDismiss';

type ComposerModelPillProps = PropsWithChildren<{
  /** Themed icon for the model; the pill falls back to the label's initial. */
  icon?: IconSource;
  label?: string;
  onPress: () => void;
}>;

/**
 * The model button. `children` trail the label inside the pill, for whatever
 * the caller wants said about the model — chat puts its reasoning effort there.
 */
export function ComposerModelPill({ children, icon, label, onPress }: ComposerModelPillProps) {
  const { t } = useTranslation();
  const { theme } = useUniwind();
  const dismissField = useComposerFieldDismiss();

  const handlePress = useCallback(() => {
    dismissField();
    onPress();
  }, [dismissField, onPress]);

  if (!label) {
    return (
      <Composer.Pill accessibilityLabel={t('chat.model.select')} onPress={handlePress}>
        <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
          {t('chat.model.select')}
        </Text>
      </Composer.Pill>
    );
  }

  return (
    <Composer.Pill
      accessibilityLabel={label}
      icon={
        icon ? (
          <Image
            cachePolicy="memory-disk"
            contentFit="contain"
            source={icon[theme === 'dark' ? 'dark' : 'light']}
            style={modelIconStyle}
          />
        ) : (
          <Text className="font-semibold text-foreground text-sm">
            {label.trim().charAt(0).toUpperCase() || 'M'}
          </Text>
        )
      }
      onPress={handlePress}
      testID="composer-model-button"
    >
      <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
      {children}
    </Composer.Pill>
  );
}

const modelIconStyle = { height: 18, width: 18 } as const;
