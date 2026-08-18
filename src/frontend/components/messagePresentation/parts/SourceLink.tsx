import { MessagePart } from '@cherrystudio/ui/components';

import { openExternalUrl } from '@/frontend/utils/openExternalUrl';

type SourceLinkProps = {
  label: string;
  url: string;
  variant?: 'card' | 'listItem';
};

export function SourceLink({ label, url, variant = 'card' }: SourceLinkProps) {
  return (
    <MessagePart.Source
      label={label}
      onPress={(sourceUrl) => void openExternalUrl(sourceUrl)}
      url={url}
      variant={variant === 'listItem' ? 'list-item' : 'card'}
    />
  );
}
