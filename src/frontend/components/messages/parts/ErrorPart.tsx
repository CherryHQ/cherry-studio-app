import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { CherryMessagePart } from '@/shared/data/types/message';

type ErrorPartProps = {
  part: Extract<CherryMessagePart, { type: 'data-error' }>;
};

export function ErrorPart({ part }: ErrorPartProps) {
  const { t } = useTranslation();
  const title = part.data.name ?? part.data.code ?? t('chat.errorPart.title');
  const message = part.data.message ?? t('chat.errorPart.message');

  return <MessagePart.Error message={message} title={title} />;
}
