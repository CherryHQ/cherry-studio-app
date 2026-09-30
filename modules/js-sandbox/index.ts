import { requireOptionalNativeModule } from 'expo';

/** Per-run budgets; the caller owns the policy. Sizes are in bytes. */
export type JsSandboxLimits = {
  timeoutMs: number;
  /** Heap size after a collection that stops the script. */
  softHeapBytes: number;
  /** Hermes aborts the process past this size, so keep it well above the soft limit. */
  hardHeapBytes: number;
  maxResultBytes: number;
  maxLogBytes: number;
};

export type JsSandboxNativeModule = {
  /** Resolves with the outcome JSON; script failures never reject. */
  run(runId: string, code: string, limits: JsSandboxLimits): Promise<string>;
  /** Interrupts a run; unknown or finished ids are ignored. */
  cancel(runId: string): void;
};

/** Null on web and on clients built before this module existed. */
export function getJsSandbox(): JsSandboxNativeModule | null {
  return requireOptionalNativeModule<JsSandboxNativeModule>('JsSandbox');
}
