import type { DirectEndpoint, RemoteCapability } from '@cherrystudio/remote-protocol';

export type DesktopConnectionStatus = 'needs-repair' | 'paired';

export type DesktopConnection = {
  configuredEndpoints: DirectEndpoint[];
  capabilities: RemoteCapability[];
  id: string;
  lastFetchedAt: number | null;
  name: string;
  status: DesktopConnectionStatus;
};
