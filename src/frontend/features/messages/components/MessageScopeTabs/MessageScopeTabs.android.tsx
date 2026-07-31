import { Tabs } from 'heroui-native';
import { useTranslation } from 'react-i18next';

import { type MessageScope, messageScopes } from '@/frontend/components/messageTabs';

import type { MessageScopeTabsProps } from './types';

const labelKeys = {
  conversations: 'topic.tabs.chat',
  drawings: 'topic.tabs.paint',
} as const;

export function MessageScopeTabs({ onScopeChange, scope }: MessageScopeTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs
      className="w-full max-w-36 gap-0"
      value={scope}
      onValueChange={(value) => {
        onScopeChange(value as MessageScope);
      }}
    >
      <Tabs.List className="h-[34px] w-full self-stretch rounded-[17px]">
        <Tabs.Indicator />
        {messageScopes.map((item) => (
          <Tabs.Trigger
            key={item}
            accessibilityRole="tab"
            accessibilityState={{ selected: item === scope }}
            className="h-7 flex-1 px-1 py-0"
            hitSlop={{ bottom: 5, top: 5 }}
            testID={`topic-list-tab-${item}`}
            value={item}
          >
            <Tabs.Label
              adjustsFontSizeToFit
              className="text-[13px]"
              maxFontSizeMultiplier={1.2}
              minimumFontScale={0.9}
              numberOfLines={1}
            >
              {t(labelKeys[item])}
            </Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
