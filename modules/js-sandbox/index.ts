import { requireOptionalNativeModule } from 'expo';

/** Per-run budgets; the caller owns the policy. Sizes are in bytes. */
export type JsSandboxLimits = {
  timeoutMs: number;
  /** Cap on everything the script's runtime allocates. */
  memoryBytes: number;
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
