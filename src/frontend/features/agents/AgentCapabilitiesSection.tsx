import type { LucideIconComponent } from '@cherrystudio/app-icons';
import BellIcon from '@cherrystudio/app-icons/icons/bell';
import CalendarIcon from '@cherrystudio/app-icons/icons/calendar';
import HeartPulseIcon from '@cherrystudio/app-icons/icons/heart-pulse';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import SearchIcon from '@cherrystudio/app-icons/icons/search';
import { Section, Switch } from '@cherrystudio/ui/components';
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

const CAPABILITY_ICONS = {
  calendar: CalendarIcon,
  health: HeartPulseIcon,
  image: ImageIcon,
  location: MapPinIcon,
  reminders: BellIcon,
  web: SearchIcon,
} satisfies Record<AgentCapability, LucideIconComponent>;

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
        const scope = row.permissionScopes.find(
          (candidate) => statuses[candidate] === 'undetermined',
        );
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

  const openSettings = useCallback(
    (scopes: readonly DevicePermissionScope[]) => {
      const permission = scopes[0]?.split('.')[0] as DevicePermission | undefined;
      void permissions.openSystemSettings(permission).catch(() => undefined);
    },
    [permissions],
  );

  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-muted-foreground text-sm">
        {t('agent.capabilities.section')}
      </Text>
      <View className="gap-2">
        {VISIBLE_ROWS.map((row) => {
          const enabled = !disabledCapabilities.includes(row.capability);
          const label = t(`agent.capabilities.${row.capability}.label`);
          const LeadingIcon = CAPABILITY_ICONS[row.capability];
          return (
            <Section key={row.capability}>
              <Section.Item
                accessibilityRole="switch"
                accessibilityState={{ checked: enabled }}
                className="py-2"
                description={
                  enabled
                    ? permissionCaption(
                        groupPermissionState(row.permissionScopes, statuses),
                        row.permissionScopes,
                        openSettings,
                        t,
                      )
                    : undefined
                }
                label={label}
                leading={<LeadingIcon className="size-5 text-foreground" />}
                onPress={() => handleToggle(row, !enabled)}
                trailing={
                  <Switch
                    accessibilityLabel={label}
                    onValueChange={(value) => handleToggle(row, value)}
                    value={enabled}
                  />
                }
              />
            </Section>
          );
        })}
      </View>
    </View>
  );
}

/**
 * Only problems earn a caption: `denied` deep-links to system settings — the
 * one place it can be fixed — and `unavailable` explains a switch that cannot
 * work. Granted and never-asked scopes stay quiet; the just-in-time request
 * covers the latter.
 */
function permissionCaption(
  state: SystemPermissionState | undefined,
  scopes: readonly DevicePermissionScope[],
  openSettings: (scopes: readonly DevicePermissionScope[]) => void,
  t: (key: string) => string,
) {
  if (state === 'denied') {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={(event) => {
          event.stopPropagation();
          openSettings(scopes);
        }}
      >
        <Text className="text-destructive text-sm">
          {t('agent.capabilities.permission.denied')}
        </Text>
      </Pressable>
    );
  }
  if (state === 'unavailable') {
    return t('agent.capabilities.permission.unavailable');
  }
  return undefined;
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
