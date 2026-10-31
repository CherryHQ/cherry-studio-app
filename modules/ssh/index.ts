import { requireOptionalNativeModule } from 'expo';

export type SshNativeOptions = {
  host: string;
  port: number;
  username?: string;
  fingerprint?: string;
  password?: string;
  privateKey?: string;
  passphrase?: string;
  command?: string;
  timeoutMs: number;
  probe: boolean;
};

export type SshNative = {
  prepare(id: string): boolean;
  cancel(id: string): void;
  run(id: string, options: SshNativeOptions): Promise<string>;
  addListener(
    event: 'onOutput',
    listener: (event: { runId: string; stream: 'stdout' | 'stderr'; base64: string }) => void,
  ): { remove(): void };
};

export function getSshNative(): SshNative | null {
  return requireOptionalNativeModule<SshNative>('Ssh');
}
