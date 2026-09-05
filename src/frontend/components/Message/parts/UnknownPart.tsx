import { MessagePart } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

export function UnknownPart() {
  const { t } = useTranslation();

  return <MessagePart.Unknown label={t('chat.message.unknownPart')} />;
}
