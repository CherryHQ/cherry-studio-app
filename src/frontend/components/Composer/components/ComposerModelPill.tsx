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
export function ComposerModelPill(props: ComposerModelPillProps) {
  const { isLocked } = useModelChoice();
  const pill = (
    <ComposerModelPillButton {...props} disabled={isLocked}>
      {props.children}
      {isLocked && props.label ? <LockedMark className="size-3.5" /> : null}
    </ComposerModelPillButton>
  );
  return isLocked && props.label ? (
    <LockedTrigger accessibilityLabel={props.label}>{pill}</LockedTrigger>
  ) : (
    pill
  );
}

/** A model trigger whose availability comes from the owning catalog. */
export function ComposerModelPillButton({
  children,
  disabled,
  icon,
  label,
  onPress,
  testID = 'composer-model-button',
}: ComposerModelPillProps & { disabled?: boolean; testID?: string }) {
  const { t } = useTranslation();
  const { runInputReplacement } = useComposerPresentationActions();

  const handlePress = useCallback(() => {
    void runInputReplacement(onPress);
  }, [onPress, runInputReplacement]);

  if (!label) {
    return (
      <Composer.Pill
        accessibilityLabel={t('chat.model.select')}
        disabled={disabled}
        onPress={handlePress}
        testID={testID}
      >
        <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
          {t('chat.model.select')}
        </Text>
      </Composer.Pill>
    );
  }

  return (
    <Composer.Pill
      accessibilityLabel={label}
      disabled={disabled}
      icon={
        icon ?? (
          <Text className="font-semibold text-foreground text-sm">
            {label.trim().charAt(0).toUpperCase() || 'M'}
          </Text>
        )
      }
      onPress={handlePress}
      testID={testID}
    >
      <Text className="min-w-0 shrink font-semibold text-foreground text-sm" numberOfLines={1}>
        {label}
      </Text>
      {children}
    </Composer.Pill>
  );
}
