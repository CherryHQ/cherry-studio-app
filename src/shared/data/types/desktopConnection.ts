import type { RemoteCapability } from '@cherrystudio/remote-protocol';

export type DesktopConnectionStatus = 'needs-repair' | 'paired';

export type DesktopConnection = {
  capabilities: RemoteCapability[];
  id: string;
  lastFetchedAt: number | null;
  name: string;
  status: DesktopConnectionStatus;
};
