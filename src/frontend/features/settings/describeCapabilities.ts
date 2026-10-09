import type { RemoteCapability } from '@cherrystudio/remote-protocol';
import type { TFunction } from 'i18next';

const LABEL_KEYS = {
  agent: 'settings.deviceConnections.capabilities.agent',
  configuration: 'settings.deviceConnections.capabilities.configuration',
} as const;

/** One line naming what the desktop granted this device. */
export function describeCapabilities(
  capabilities: readonly RemoteCapability[],
  t: TFunction,
): string {
  if (capabilities.length === 0) return t('settings.deviceConnections.capabilities.none');
  return capabilities.map((capability) => t(LABEL_KEYS[capability])).join(' · ');
}
