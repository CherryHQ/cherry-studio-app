import { requireOptionalNativeModule } from 'expo';

/** Per-run budgets; the caller owns the policy. Sizes are in bytes. */
export type JsSandboxLimits = {
  /** 0 means no time limit; cancellation still stops the run. */
  timeoutMs: number;
  /** Cap on everything the script's runtime allocates. */
  memoryBytes: number;
  maxResultBytes: number;
  maxLogBytes: number;
};

export type JsSandboxNativeModule = {
  /** Resolves with the outcome JSON; script failures never reject. */
  run(runId: string, code: string, limits: JsSandboxLimits): Promise<string>;
  /** Interrupts a run, including one that has not started yet. */
  cancel(runId: string): void;
};

/** Null on web and on clients built before this module existed. */
export function getJsSandbox(): JsSandboxNativeModule | null {
  return requireOptionalNativeModule<JsSandboxNativeModule>('JsSandbox');
}
