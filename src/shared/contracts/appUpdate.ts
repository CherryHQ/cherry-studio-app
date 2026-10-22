export type AppUpdateChannel = 'apk' | 'google-play' | 'app-store';

export type AppUpdateRelease = {
  /** Channel-qualified release identity; also used to throttle reminders. */
  id: string;
  currentVersion: string;
} & (
  | { channel: 'apk'; latestVersion: string; downloadUrl: string; checksumUrl: string }
  /** Google Play exposes a build number, not a public version name. */
  | { channel: 'google-play'; latestVersion: null; storeUrl: string }
  | { channel: 'app-store'; latestVersion: string; storeUrl: string }
);

export type ApkUpdateRelease = Extract<AppUpdateRelease, { channel: 'apk' }>;

export type AppUpdateResult =
  | ({ status: 'available' } & AppUpdateRelease)
  | { status: 'upToDate'; currentVersion: string }
  | {
      status: 'unavailable';
      reason: 'unsupported' | 'unknownVersion' | 'noRelease' | 'nativeUnavailable';
    };

export type AppUpdateDownload =
  | { status: 'idle' }
  | {
      status: 'downloading';
      release: ApkUpdateRelease;
      receivedBytes: number;
      totalBytes: number | null;
    }
  | { status: 'verifying' | 'ready'; release: ApkUpdateRelease }
  | { status: 'failed'; release: ApkUpdateRelease; reason: 'download' | 'verification' };

export interface AppUpdateModule {
  readonly channel: AppUpdateChannel | null;
  readonly isEnabled: boolean;
  check(signal?: AbortSignal): Promise<AppUpdateResult>;
  openStore(release: AppUpdateRelease): Promise<void>;
  /** One app-owned transfer, shared by every screen. Completion never installs automatically. */
  download(release: ApkUpdateRelease): Promise<void>;
  cancelDownload(): Promise<void>;
  getDownload(): AppUpdateDownload;
  subscribeDownload(listener: () => void): () => void;
  install(): Promise<'opened' | 'permissionRequired' | 'invalidPackage'>;
  requestInstallPermission(): Promise<boolean>;
}
