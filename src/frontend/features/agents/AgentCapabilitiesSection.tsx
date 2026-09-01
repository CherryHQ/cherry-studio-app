import { Switch } from '@cherrystudio/ui/components';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';

import { useBackendModule } from '@/frontend/data';
import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';
import type {
  DevicePermission,
  DevicePermissionScope,
  PermissionStatuses,
  SystemPermissionState,
} from '@/shared/contracts';
import type { AgentCapability } from '@/shared/data/types/agentCapability';
import { getAgentCapabilityAvailability } from '@/shared/data/types/builtInTool';

type AgentCapabilitiesSectionProps = {
  disabledCapabilities: readonly AgentCapability[];
  onChange: (disabledCapabilities: AgentCapability[]) => void;
};

type CapabilityRow = {
  capability: AgentCapability;
  permissionScopes: readonly DevicePermissionScope[];
};

const CAPABILITY_DISPLAY_ORDER = [
  'web',
  'image',
  'calendar',
  'reminders',
  'health',
  'location',
] as const satisfies readonly AgentCapability[];

// Availability facts are static per build, so the visible rows and the scope
// set the permission hook observes can be module constants — the hook requires
// a stable scope array.
const VISIBLE_ROWS: readonly CapabilityRow[] = CAPABILITY_DISPLAY_ORDER.flatMap((capability) => {
  const availability = getAgentCapabilityAvailability(capability);
  const isSupported =
    availability.platforms === null ||
    availability.platforms.some((platform) => platform === Platform.OS);
  return isSupported ? [{ capability, permissionScopes: availability.permissionScopes }] : [];
});

const OBSERVED_SCOPES: readonly DevicePermissionScope[] = [
  ...new Set(VISIBLE_ROWS.flatMap((row) => row.permissionScopes)),
];

export function AgentCapabilitiesSection({
  disabledCapabilities,
  onChange,
}: AgentCapabilitiesSectionProps) {
  const { t } = useTranslation();
  const permissions = useBackendModule('permissions');
  const { refresh, statuses } = useDevicePermissionStatuses(OBSERVED_SCOPES);

  const handleToggle = useCallback(
    (row: CapabilityRow, enabled: boolean) => {
      onChange(
        enabled
          ? disabledCapabilities.filter((capability) => capability !== row.capability)
          : [...new Set([...disabledCapabilities, row.capability])],
      );
      // Opting in is the clearest moment to ask the system: request the first
      // never-asked scope right away. Remaining scopes stay with the in-turn
      // just-in-time request, so the user sees one dialog here, not a queue.
      if (enabled) {
        const scope = row.permissionScopes.find((candidate) => {
          const status = statuses[candidate];
          return status === 'undetermined';
        });
        if (scope) {
          void permissions
            .request(scope)
            .catch(() => undefined)
            .then(() => refresh().catch(() => undefined));
        }
      }
    },
    [disabledCapabilities, onChange, permissions, refresh, statuses],
  );

  return (
    <View className="gap-4">
      <Text className="text-muted-foreground text-sm" selectable>
        {t('agent.capabilities.description')}
      </Text>
      <View className="gap-4">
        {VISIBLE_ROWS.map((row) => (
          <AgentCapabilityRow
            enabled={!disabledCapabilities.includes(row.capability)}
            key={row.capability}
            onToggle={handleToggle}
            row={row}
            statuses={statuses}
          />
        ))}
      </View>
    </View>
  );
}

function AgentCapabilityRow({
  enabled,
  onToggle,
  row,
  statuses,
}: {
  enabled: boolean;
  onToggle: (row: CapabilityRow, enabled: boolean) => void;
  row: CapabilityRow;
  statuses: PermissionStatuses;
}) {
  const { t } = useTranslation();
  const label = t(`agent.capabilities.${row.capability}.label`);
  const permissionState = groupPermissionState(row.permissionScopes, statuses);
  const handleValueChange = useCallback((value: boolean) => onToggle(row, value), [onToggle, row]);

  return (
    <View className="min-h-12 flex-row items-center gap-3">
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="font-medium text-base text-foreground" numberOfLines={1}>
          {label}
        </Text>
        <Text className="text-muted-foreground text-xs" selectable>
          {t(`agent.capabilities.${row.capability}.description`)}
        </Text>
        {enabled ? (
          <PermissionStateText state={permissionState} scopes={row.permissionScopes} />
        ) : null}
      </View>
      <Switch accessibilityLabel={label} onValueChange={handleValueChange} value={enabled} />
    </View>
  );
}

/**
 * Only states the user can act on are surfaced: a granted or still-loading
 * scope needs no caption, `undetermined` explains the upcoming one-shot system
 * prompt, and `denied` deep-links to system settings — the only place it can
 * be fixed.
 */
function PermissionStateText({
  scopes,
  state,
}: {
  scopes: readonly DevicePermissionScope[];
  state: SystemPermissionState | undefined;
}) {
  const { t } = useTranslation();
  const permissions = useBackendModule('permissions');
  const openSettings = useCallback(() => {
    const permission = scopes[0]?.split('.')[0] as DevicePermission | undefined;
    void permissions.openSystemSettings(permission).catch(() => undefined);
  }, [permissions, scopes]);

  if (state === 'undetermined') {
    return (
      <Text className="text-muted-foreground text-xs" selectable>
        {t('agent.capabilities.permission.undetermined')}
      </Text>
    );
  }
  if (state === 'denied') {
    return (
      <Pressable accessibilityRole="button" onPress={openSettings}>
        <Text className="text-destructive text-xs">
          {t('agent.capabilities.permission.denied')}
        </Text>
      </Pressable>
    );
  }
  if (state === 'unavailable') {
    return (
      <Text className="text-muted-foreground text-xs" selectable>
        {t('agent.capabilities.permission.unavailable')}
      </Text>
    );
  }
  return null;
}

function groupPermissionState(
  scopes: readonly DevicePermissionScope[],
  statuses: PermissionStatuses,
): SystemPermissionState | undefined {
  if (scopes.length === 0) {
    return undefined;
  }
  const states = scopes.map((scope) => statuses[scope]);
  if (states.some((state) => state === undefined)) {
    return undefined;
  }
  if (states.every((state) => state === 'granted')) {
    return 'granted';
  }
  if (states.some((state) => state === 'denied')) {
    return 'denied';
  }
  if (states.some((state) => state === 'undetermined')) {
    return 'undetermined';
  }
  return 'unavailable';
}
