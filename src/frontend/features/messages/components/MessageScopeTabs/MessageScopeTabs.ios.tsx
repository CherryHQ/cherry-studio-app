import { Tabs } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { messageScopes } from '@/frontend/components/messageTabs';

import type { MessageScopeTabsProps } from './types';

const labelKeys = {
  conversations: 'topic.tabs.chat',
  drawings: 'topic.tabs.paint',
} as const;

export function MessageScopeTabs({ onScopeChange, scope }: MessageScopeTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs
      items={messageScopes.map((item) => ({
        label: t(labelKeys[item]),
        testID: `topic-list-tab-${item}`,
        value: item,
      }))}
      onValueChange={onScopeChange}
      style={{ width: 144 }}
      value={scope}
    />
  );
}
