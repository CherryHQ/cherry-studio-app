import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Availability } from '@/frontend/appShell/conversation';

/** Source presentation only; action admission is checked by each bound action. */
export function ConversationStatus({
  availability,
  onRepair,
}: {
  availability: Availability;
  onRepair(): void;
}) {
  const { t } = useTranslation();
  if (availability.state === 'enabled') return null;
  const repair = ['retired', 'needs-repair', 'not-authorized'].includes(availability.reason);
  return (
    <View className="flex-row items-center gap-2 px-4 py-2">
      <Text className="flex-1 text-sm text-muted-foreground">
        {t(
          repair
            ? 'remoteAgent.pairAgain'
            : availability.reason === 'upgrade-required'
              ? 'remoteAgent.upgradeRequired'
              : availability.reason === 'synchronizing'
                ? 'remoteAgent.connecting'
                : 'remoteAgent.disconnected',
        )}
      </Text>
      {repair ? (
        <Button size="sm" variant="ghost" onPress={onRepair}>
          {t('remoteAgent.repair')}
        </Button>
      ) : null}
    </View>
  );
}
