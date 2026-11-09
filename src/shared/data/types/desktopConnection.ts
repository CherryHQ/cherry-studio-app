import type { DirectEndpoint, RemoteCapability } from '@cherrystudio/remote-protocol';

export type DesktopConnectionStatus = 'needs-repair' | 'paired';

export type DesktopConnection = {
  alias: string | null;
  configuredEndpoints: DirectEndpoint[];
  capabilities: RemoteCapability[];
  defaultName: string;
  id: string;
  lastFetchedAt: number | null;
  name: string;
  status: DesktopConnectionStatus;
};
