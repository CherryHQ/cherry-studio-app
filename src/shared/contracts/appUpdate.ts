export type AppUpdateResult =
  | { status: 'available'; currentVersion: string; latestVersion: string; downloadUrl: string }
  | { status: 'upToDate'; currentVersion: string }
  | {
      status: 'unavailable';
      reason: 'unsupported' | 'unknownVersion' | 'noRelease';
    };

export interface AppUpdateModule {
  readonly isEnabled: boolean;
  check(signal?: AbortSignal): Promise<AppUpdateResult>;
  openDownload(downloadUrl: string): Promise<void>;
}
