import LockIcon from '@cherrystudio/app-icons/icons/lock';
import { Chip } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

/**
 * Origin mark for an Agent, Skill, or MCP server the enterprise server delivers. The lock shape
 * and the word carry the meaning without colour.
 */
export function ManagedBadge() {
  const { t } = useTranslation();
  return (
    <Chip.Tag
      className="shrink-0 gap-1 self-center rounded-lg px-1.5 py-0.5"
      testID="managed-badge"
    >
      <LockIcon className="size-3 text-muted-foreground" />
      <Chip.Label className="text-xs text-muted-foreground">
        {t('enterprise.managed.badge')}
      </Chip.Label>
    </Chip.Tag>
  );
}
