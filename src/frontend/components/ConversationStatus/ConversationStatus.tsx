import { Button } from '@cherrystudio/ui/components';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { Availability } from '@/frontend/appShell/conversation';

const CONNECTION_MESSAGES: Partial<
  Record<Extract<Availability, { state: 'disabled' }>['reason'], string>
> = {
  'no-location': 'settings.desktopConnection.error.no-location',
  'discovery-unavailable': 'settings.desktopConnection.error.discovery-unavailable',
  unreachable: 'settings.desktopConnection.error.unreachable',
};

/** Source presentation only; action admission is checked by each bound action. */
export function ConversationStatus({
  availability,
  onRepair,
  onEditAddresses,
}: {
  availability: Availability;
  onRepair(): void;
  onEditAddresses?: () => void;
}) {
  const { t } = useTranslation();
  if (availability.state === 'enabled') return null;
  const repair = ['retired', 'needs-repair', 'not-authorized'].includes(availability.reason);
  const connectionMessage = CONNECTION_MESSAGES[availability.reason];
  const editAddresses = onEditAddresses && (connectionMessage || availability.reason === 'offline');
  return (
    <View className="flex-row items-center gap-2 px-4 py-2">
      <Text className="flex-1 text-sm text-muted-foreground">
        {t(
          connectionMessage ??
            (repair
              ? 'remoteAgent.pairAgain'
              : availability.reason === 'upgrade-required'
                ? 'remoteAgent.upgradeRequired'
                : availability.reason === 'synchronizing'
                  ? 'remoteAgent.connecting'
                  : 'remoteAgent.disconnected'),
        )}
      </Text>
      {repair ? (
        <Button size="sm" variant="ghost" onPress={onRepair}>
          {t('remoteAgent.repair')}
        </Button>
      ) : null}
      {editAddresses ? (
        <Button size="sm" variant="ghost" onPress={onEditAddresses}>
          {t('settings.deviceConnections.location.edit')}
        </Button>
      ) : null}
    </View>
  );
}
