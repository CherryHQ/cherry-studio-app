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
  cwd?: string;
  stdin?: string;
  directory?: string;
  poolKey?: string;
  operation?: 'exec' | 'list' | 'read' | 'write' | 'download' | 'upload';
  path?: string;
  localPath?: string;
  content?: string;
  overwrite?: boolean;
  timeoutMs: number;
  probe: boolean;
};

export type SshNative = {
  readonly resultVersion: number;
  prepare(id: string): boolean;
  cancel(id: string): void;
  respond(id: string, challenge: string, responses: readonly string[]): void;
  closePool(key: string): void;
  closeAll(): void;
  maintain(): Promise<number>;
  run(id: string, options: SshNativeOptions): Promise<string>;
  addListener(
    event: 'onEvent',
    listener: (event: {
      runId: string;
      stream: 'stdout' | 'stderr' | 'authentication' | 'progress';
      base64: string;
    }) => void,
  ): { remove(): void };
};

export function getSshNative(): SshNative | null {
  const native = requireOptionalNativeModule<SshNative>('Ssh');
  return native &&
    native.resultVersion === 2 &&
    typeof native.respond === 'function' &&
    typeof native.maintain === 'function'
    ? native
    : null;
}
