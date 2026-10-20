import MicIcon from '@cherrystudio/app-icons/icons/mic';
import SquareIcon from '@cherrystudio/app-icons/icons/square';
import { Composer } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useDictation } from './useDictation';

/** Interim control until the voice input design lands: tap to dictate, tap again to finish. */
export function ChatInputDictationButton() {
  const { t } = useTranslation();
  const dictation = useDictation();
  const isActive = dictation.state !== 'idle';
  return (
    <Composer.Action
      accessibilityLabel={t(isActive ? 'voice.dictation.stop' : 'voice.dictation.start')}
      className="bg-transparent"
      disabled={dictation.state === 'starting' || dictation.state === 'finishing'}
      onPress={() => (isActive ? dictation.stop() : void dictation.start())}
      testID="chat-composer-dictation"
    >
      {isActive ? (
        <SquareIcon
          className="size-5 text-foreground"
          style={{ opacity: 0.4 + dictation.level * 0.6 }}
        />
      ) : (
        <MicIcon className="size-5 text-foreground" />
      )}
    </Composer.Action>
  );
}
