export type DesktopConnectionStatus = 'needs-repair' | 'paired';

export type DesktopConnection = {
  activeBaseUrl: string;
  desktopVersion: string;
  id: string;
  lastFetchedAt: number | null;
  name: string;
  status: DesktopConnectionStatus;
};
