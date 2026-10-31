import { Composer, LockedMark, LockedTrigger } from '@cherrystudio/ui/components';
import { type PropsWithChildren, type ReactNode, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Text } from 'react-native';

import { useModelChoice } from '@/frontend/components/Policy';

import { useComposerPresentationActions } from '../context/ComposerProvider';

type ComposerModelPillProps = PropsWithChildren<{
  /** Composed model icon; the pill falls back to the label's initial. */
  icon?: ReactNode;
  label?: string;
  onPress: () => void;
}>;

/**
 * The model button. `children` trail the label inside the pill, for whatever
 * the caller wants said about the model — chat puts its reasoning effort there.
 */
export function ComposerModelPill({ children, icon, label, onPress }: ComposerModelPillProps) {
  const { t } = useTranslation();
  const { runInputReplacement } = useComposerPresentationActions();
  // A scope with one allowed model leaves the pill showing it, with nothing to open.
  const { isLocked } = useModelChoice();

  const handlePress = useCallback(() => {
    void runInputReplacement(onPress);
  }, [onPress, runInputReplacement]);

  if (!label) {
    return (
      <Composer.Pill
        accessibilityLabel={t('chat.model.select')}
        disabled={isLocked}
        onPress={handlePress}
      >
        <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
          {t('chat.model.select')}
        </Text>
      </Composer.Pill>
    );
  }

  const pill = (
    <Composer.Pill
      accessibilityLabel={label}
      disabled={isLocked}
      icon={
        icon ?? (
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
      {isLocked ? <LockedMark className="size-3.5" /> : null}
    </Composer.Pill>
  );
  // The organization chose the only model: pressing explains that instead of opening a picker.
  return isLocked ? <LockedTrigger accessibilityLabel={label}>{pill}</LockedTrigger> : pill;
}
