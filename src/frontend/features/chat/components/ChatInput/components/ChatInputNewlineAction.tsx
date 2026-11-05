import CornerDownLeftIcon from '@cherrystudio/app-icons/icons/corner-down-left';
import { Composer } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useComposerMeta } from '@/frontend/components/Composer';

export function ChatInputNewlineAction() {
  const { t } = useTranslation();
  const { inputRef } = useComposerMeta();

  return (
    <Composer.Action
      accessibilityLabel={t('chat.input.action.insertNewline')}
      onPress={() => inputRef.current?.insertText('\n')}
      testID="composer-insert-newline"
    >
      <CornerDownLeftIcon className="size-5 text-muted-foreground" />
    </Composer.Action>
  );
}
