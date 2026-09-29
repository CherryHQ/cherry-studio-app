import type { ReactNode } from 'react';
import { View } from 'react-native';

import { ProviderFormApiKeys } from './components/ProviderFormApiKeys';
import { ProviderFormAvatar } from './components/ProviderFormAvatar';
import { ProviderFormEndpoint } from './components/ProviderFormEndpoint';
import { ProviderFormBaseUrl, ProviderFormTextEndpoints } from './components/ProviderFormEndpoints';
import { ProviderFormName } from './components/ProviderFormFields';
import { type ProviderForm as ProviderFormValue, ProviderFormContext } from './context';

type ProviderFormProps = {
  children: ReactNode;
  value: ProviderFormValue;
};

/**
 * Provider editing as a compound component: `ProviderForm.Avatar` / `.Name` /
 * `.BaseUrl` or `.Endpoints` / `.ApiKeys` under a root that carries the draft.
 * Screens compose the fields they want instead of switching them on and off.
 *
 * The root deliberately renders no scroll container: the screen owns that, so
 * its header and scroll view are mounted on the first frame even while the
 * provider it edits is still loading.
 */
function ProviderFormRoot({ children, value }: ProviderFormProps) {
  return (
    <ProviderFormContext value={value}>
      {/* Bare fields, one gap apart, the way the Agent editor stacks them. The
          avatar block adds its own space below itself so it can sit further
          from the first field than the fields do from each other. */}
      <View className="gap-3 px-4 py-5">{children}</View>
    </ProviderFormContext>
  );
}

ProviderFormRoot.displayName = 'ProviderForm';

export const ProviderForm = Object.assign(ProviderFormRoot, {
  ApiKeys: ProviderFormApiKeys,
  Avatar: ProviderFormAvatar,
  BaseUrl: ProviderFormBaseUrl,
  Endpoint: ProviderFormEndpoint,
  Endpoints: ProviderFormTextEndpoints,
  Name: ProviderFormName,
});
