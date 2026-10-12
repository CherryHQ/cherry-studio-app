import { Section } from '@cherrystudio/ui/components';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { useDevicePermissionStatuses } from '@/frontend/hooks/useDevicePermissionStatuses';
import { type DevicePermissionScope, summarizeDevicePermissions } from '@/shared/contracts';
import type { AgentCapability } from '@/shared/data/types/agentCapability';
import { getAgentCapabilityAvailability } from '@/shared/data/types/builtInTool';

import { setAgentCapabilityEnabled } from '../agentForm';

type AgentCapabilitiesSectionProps = {
  disabledCapabilities: readonly AgentCapability[];
  onChange: (disabledCapabilities: AgentCapability[]) => void;
};

type CapabilityRow = {
  capability: AgentCapability;
  permissionScopes: readonly DevicePermissionScope[];
};

// App-owned groups first, then device groups that also need an OS permission.
const CAPABILITY_DISPLAY_ORDER = [
  'web',
  'image',
  'agents',
  'calendar',
  'reminders',
  'location',
] as const satisfies readonly AgentCapability[];

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
    onChange(setAgentCapabilityEnabled(disabledCapabilities, row.capability, enabled));
    // This changes the Agent's intent only. System access is requested for the
    // actual operation, after the in-chat approval, or explicitly in Settings.
  };

  // One grouped card; a capability that still needs system access gets its
  // management row directly under its switch.
  return (
    <Section title={t('agent.capabilities.section')}>
      {visibleRows.flatMap((row) => {
        const enabled = !disabledCapabilities.includes(row.capability);
        const status = summarizeDevicePermissions(row.permissionScopes, statuses);
        const needsPermission = enabled && status !== undefined && status.state !== 'granted';
        const items = [
          <Section.SwitchItem
            key={row.capability}
            description={
              needsPermission
                ? t(
                    status.reason
                      ? `settings.permissions.reason.${status.reason}`
                      : `agent.capabilities.permission.${status.state}`,
                  )
                : undefined
            }
            label={t(`agent.capabilities.${row.capability}.label`)}
            onValueChange={(value) => handleToggle(row, value)}
            value={enabled}
          />,
        ];
        if (needsPermission) {
          items.push(
            <Section.Item
              key={`${row.capability}-permission`}
              label={t('agent.capabilities.permission.manage')}
              onPress={() =>
                router.push({
                  pathname: '/settings/permissions/[permission]',
                  params: { permission: row.capability },
                })
              }
            />,
          );
        }
        return items;
      })}
    </Section>
  );
}
