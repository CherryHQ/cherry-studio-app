import { Chip } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import type { ChatInputAction } from '../utils/chatInputActions';

type ChatInputToolTagProps = {
  onClear: () => void;
  tool: ChatInputAction;
};

/** The selected tool, shown above the field until it is cleared. */
export function ChatInputToolTag({ onClear, tool }: ChatInputToolTagProps) {
  const { t } = useTranslation();
  const Icon = tool.icon;

  return (
    <Chip.Removable onRemove={onClear} removeAccessibilityLabel={t('common.clear')}>
      <Icon className="size-4 text-foreground" />
      <Chip.Label numberOfLines={1}>{t(tool.tagTitleKey)}</Chip.Label>
    </Chip.Removable>
  );
}
