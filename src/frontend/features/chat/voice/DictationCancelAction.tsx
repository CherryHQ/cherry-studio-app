import XIcon from '@cherrystudio/app-icons/icons/x';
import { Composer } from '@cherrystudio/ui/components';
import * as Haptics from 'expo-haptics';
import { useTranslation } from 'react-i18next';
import Animated, { useReducedMotion } from 'react-native-reanimated';

import { slotEnter, slotExit } from './slotMotion';

/** Takes the leading slot while dictating: discards the dictation and restores the draft. */
export function DictationCancelAction({ onCancel }: { onCancel: () => void }) {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();
  return (
    <Animated.View {...(reducedMotion ? {} : { entering: slotEnter, exiting: slotExit })}>
      <Composer.Action
        accessibilityLabel={t('voice.dictation.cancel')}
        onPress={() => {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onCancel();
        }}
        testID="chat-composer-dictation-cancel"
      >
        <XIcon className="size-5 text-foreground" />
      </Composer.Action>
    </Animated.View>
  );
}
