import { MessagePart } from '@cherrystudio/ui/components';
import type { CherryMessagePart } from '@cherrystudio/universal/data/types/message';
import { useTranslation } from 'react-i18next';

type ErrorPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-error' }>;
};

export function ErrorPart({ part }: ErrorPartProps) {
  const { t } = useTranslation();
  const title = part.data.name ?? part.data.code ?? t('chat.errorPart.title');
  const message = part.data.message ?? t('chat.errorPart.message');

  return <MessagePart.Error message={message} title={title} />;
}
