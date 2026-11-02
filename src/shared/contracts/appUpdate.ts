export type DomesticAppStore = 'honor' | 'xiaomi' | 'oppo' | 'vivo';
export type DomesticStoreAction = { channel: 'domestic-stores'; store: DomesticAppStore };
export type AppUpdateChannel = 'apk' | 'google-play' | 'app-store' | 'domestic-stores';

export type AppUpdateRelease = {
  /** Channel-qualified release identity; also used to throttle reminders. */
  id: string;
  currentVersion: string;
  /** What the distribution source published with this version, when it publishes anything. */
  notes: string | null;
} & (
  | { channel: 'apk'; latestVersion: string; downloadUrl: string; checksumUrl: string }
  /** Google Play exposes a build number, not a public version name. */
  | { channel: 'google-play'; latestVersion: null; storeUrl: string }
  | { channel: 'app-store'; latestVersion: string; storeUrl: string }
  | (DomesticStoreAction & { latestVersion: string | null; versionCode: number; expiresAt: number })
);

export type ApkUpdateRelease = Extract<AppUpdateRelease, { channel: 'apk' }>;

export type AppUpdateResult =
  | ({ status: 'available' } & AppUpdateRelease)
  | { status: 'upToDate'; currentVersion: string }
  /** A manual store visit is available, but no newer version has been established. */
  | { status: 'storeOnly'; stores: DomesticAppStore[] }
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
  /** Resolved once for this process; domestic query caches remain isolated by store. */
  readonly store?: DomesticAppStore | null;
  check(signal?: AbortSignal): Promise<AppUpdateResult>;
  openStore(release: AppUpdateRelease | DomesticStoreAction): Promise<void>;
  /** One app-owned transfer, shared by every screen. Completion never installs automatically. */
  download(release: ApkUpdateRelease): Promise<void>;
  cancelDownload(): Promise<void>;
  /** Release notes for the UI language; a failed lookup degrades to no notes. */
  releaseNotes(release: AppUpdateRelease, language: string): Promise<string | null>;
  getDownload(): AppUpdateDownload;
  subscribeDownload(listener: () => void): () => void;
  install(): Promise<'opened' | 'permissionRequired' | 'invalidPackage'>;
  requestInstallPermission(): Promise<boolean>;
}
