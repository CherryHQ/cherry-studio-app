import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { AiFailureMessage } from '@/frontend/components/AiFailure';
import type { CherryMessagePart } from '@/shared/data/types/message';

export function ErrorPart({ part }: { part: Extract<CherryMessagePart, { type: 'data-error' }> }) {
  const { t } = useTranslation();
  if (part.data.code === 'INTERRUPTED') {
    return (
      <MessagePart.Error
        message={t('chat.errorPart.interrupted.message')}
        title={t('chat.errorPart.interrupted.title')}
      />
    );
  }
  return <AiFailureMessage data={part.data} />;
}
