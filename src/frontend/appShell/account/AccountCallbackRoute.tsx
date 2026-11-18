import { ContentState } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { useAccountCallback } from './useAccountCallback';

/** Handles cold starts as well as a deep link delivered alongside the live auth browser. */
export function AccountCallbackRoute() {
  const { t } = useTranslation();
  useAccountCallback();

  return (
    <View className="flex-1 justify-center">
      <ContentState.Loading title={t('account.returning')} />
    </View>
  );
}
