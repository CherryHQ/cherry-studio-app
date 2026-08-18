import { MessagePart } from '@cherrystudio/ui/components';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

type SourceUrlItemProps = {
  label: string;
  url: string;
  variant?: 'card' | 'listItem';
};

export function SourceUrlItem({ label, url, variant = 'card' }: SourceUrlItemProps) {
  return (
    <MessagePart.Source
      label={label}
      onPress={(sourceUrl) => void openExternalUrl(sourceUrl)}
      url={url}
      variant={variant === 'listItem' ? 'list-item' : 'card'}
    />
  );
}
