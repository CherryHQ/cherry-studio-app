import { Tabs } from 'heroui-native';
import { useTranslation } from 'react-i18next';

import { useSearchScope } from '../context/SearchScopeProvider';
import { type SearchScope, searchScopes } from '../utils/searchScope';

const labelKeys = {
  assistants: 'navigation.assistants',
  messages: 'navigation.messages',
  settings: 'navigation.settings',
} as const;

export function SearchScopeTabs() {
  const { t } = useTranslation();
  const { scope, setScope } = useSearchScope();

  return (
    <Tabs
      className="w-full px-2 pt-3 pb-2"
      value={scope}
      onValueChange={(value) => setScope(value as SearchScope)}
    >
      <Tabs.List className="w-full self-stretch">
        <Tabs.Indicator />
        {searchScopes.map((item) => (
          <Tabs.Trigger
            key={item}
            className="flex-1"
            testID={`search-scope-tab-${item}`}
            value={item}
          >
            <Tabs.Label>{t(labelKeys[item])}</Tabs.Label>
          </Tabs.Trigger>
        ))}
      </Tabs.List>
    </Tabs>
  );
}
