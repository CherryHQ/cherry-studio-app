import { Tabs } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';

import { useSearchScope } from '../context/SearchScopeProvider';
import { searchScopes } from '../utils/searchScope';

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
      items={searchScopes.map((item) => ({
        label: t(labelKeys[item]),
        testID: `search-scope-tab-${item}`,
        value: item,
      }))}
      onValueChange={setScope}
      value={scope}
    />
  );
}
