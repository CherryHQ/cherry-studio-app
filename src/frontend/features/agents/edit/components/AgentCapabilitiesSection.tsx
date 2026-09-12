import type { LucideIconComponent } from '@cherrystudio/app-icons';
import BellIcon from '@cherrystudio/app-icons/icons/bell';
import CalendarIcon from '@cherrystudio/app-icons/icons/calendar';
import GlobeIcon from '@cherrystudio/app-icons/icons/globe';
import HeartPulseIcon from '@cherrystudio/app-icons/icons/heart-pulse';
import ImageIcon from '@cherrystudio/app-icons/icons/image';
import MapPinIcon from '@cherrystudio/app-icons/icons/map-pin';
import { Section } from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';

import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';
import { type DevicePermissionScope, summarizeDevicePermissions } from '@/shared/contracts';
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
  web: GlobeIcon,
} satisfies Record<AgentCapability, LucideIconComponent>;

// Platform support is static; device support is checked from live statuses below.
// Keep the observed scope array stable for the permission hook.
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
  const { statuses } = useDevicePermissionStatuses(OBSERVED_SCOPES);
  const visibleRows = VISIBLE_ROWS.filter(
    (row) =>
      !row.permissionScopes.length ||
      !row.permissionScopes.every((scope) => statuses[scope]?.reason === 'unsupported'),
  );

  const handleToggle = (row: CapabilityRow, enabled: boolean) => {
    onChange(
      enabled
        ? disabledCapabilities.filter((capability) => capability !== row.capability)
        : [...new Set([...disabledCapabilities, row.capability])],
    );
    // This changes the Agent's intent only. System access is requested for the
    // actual operation, after the in-chat approval, or explicitly in Settings.
  };

  return (
    <View className="gap-2">
      <Text className="px-1 font-medium text-muted-foreground text-sm">
        {t('agent.capabilities.section')}
      </Text>
      <View className="gap-2">
        {visibleRows.map((row) => {
          const enabled = !disabledCapabilities.includes(row.capability);
          const status = summarizeDevicePermissions(row.permissionScopes, statuses);
          const showPermissionAction = enabled && status && status.state !== 'granted';
          const label = t(`agent.capabilities.${row.capability}.label`);
          const LeadingIcon = CAPABILITY_ICONS[row.capability];
          return (
            <Section key={row.capability}>
              <Section.SwitchItem
                density="compact"
                description={
                  enabled && status && status.state !== 'granted'
                    ? t(
                        status.reason
                          ? `settings.permissions.reason.${status.reason}`
                          : `agent.capabilities.permission.${status.state}`,
                      )
                    : undefined
                }
                label={label}
                leading={<LeadingIcon className="size-5 text-foreground" />}
                onValueChange={(value) => handleToggle(row, value)}
                value={enabled}
              />
              {showPermissionAction && (
                <Section.Item
                  density="compact"
                  label={t('agent.capabilities.permission.manage')}
                  onPress={() =>
                    router.push({
                      pathname: '/settings/permissions/[permission]',
                      params: { permission: row.capability },
                    })
                  }
                />
              )}
            </Section>
          );
        })}
      </View>
    </View>
  );
}
