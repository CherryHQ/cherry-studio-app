import { CLOUD_PROVIDER_ID } from '@/shared/contracts/cloud';
import { isEnterpriseProfile } from '@/shared/data/activeProfile';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import {
  agentPolicy,
  editionCapabilities,
  managedResourcePolicy,
} from '@/shared/data/managedPolicy';
import type { UniqueModelId } from '@/shared/data/types/model';

const MANAGED = 'managed by the enterprise server';

/** Cloud catalog configuration is supplied by the signed-in account, never by provider settings. */
export function assertUserOwnedProvider(providerId: string): void {
  if (providerId === CLOUD_PROVIDER_ID || providerId.startsWith(`${CLOUD_PROVIDER_ID}::`))
    throw DataApiErrorFactory.invalidOperation('provider.edit', 'managed by Cherry Cloud');
}

let admitEnterpriseSession: () => Promise<void> = async () => {};

/** Bootstrap supplies the account's check; the shared layer never imports enterprise code. */
export function configureEnterpriseSessionAdmission(admit: () => Promise<void>): void {
  admitEnterpriseSession = admit;
}

/**
 * Enterprise providers carry the organization's gateway key. Work that would send it, such as a
 * model request, needs a session the server has not refused.
 */
export async function assertEnterpriseSessionAdmitted(): Promise<void> {
  if (isEnterpriseProfile()) await admitEnterpriseSession();
}

/** Rejects an operation the managed-resource policy does not allow. */
export function denyUnless(allowed: boolean, operation: string): void {
  if (!allowed) throw DataApiErrorFactory.invalidOperation(operation, MANAGED);
}

type AsyncMethodNames<T> = {
  [K in keyof T]: T[K] extends (...args: never[]) => Promise<unknown> ? K : never;
}[keyof T] &
  string;

type MethodChecks<T> = {
  [K in AsyncMethodNames<T>]?: T[K] extends (...args: infer A) => Promise<unknown>
    ? (this: T, ...args: A) => void | Promise<void>
    : never;
};

/**
 * Wraps a service's async methods so each first passes its policy check, keeping policy out of the
 * method bodies. A check that must read inside the method's write transaction stays in the method.
 */
export function guardMethods<T extends object>(
  service: { prototype: T },
  checks: MethodChecks<T>,
): void {
  const prototype = service.prototype as Record<
    string,
    (this: T, ...args: unknown[]) => Promise<unknown>
  >;
  for (const [name, check] of Object.entries(checks) as [
    string,
    (this: T, ...args: unknown[]) => void | Promise<void>,
  ][]) {
    const run = prototype[name]!;
    prototype[name] = async function (this: T, ...args: unknown[]) {
      await check.apply(this, args);
      return run.apply(this, args);
    };
  }
}

/** The same check for each listed method: the profile must let the user change providers. */
export function providerSettingsChecks<T>(
  scope: string,
  methods: readonly AsyncMethodNames<T>[],
): MethodChecks<T> {
  return Object.fromEntries(
    methods.map((method) => [
      method,
      () => denyUnless(editionCapabilities().providerSettings, `${scope}.${method}`),
    ]),
  ) as MethodChecks<T>;
}

type ManagedRow = Readonly<{ managedRemoteId: string | null }>;

/** A delivered MCP server's or Skill's policy, from its stored `managed_remote_id`. */
export function managedRowPolicy(row: ManagedRow | undefined) {
  return managedResourcePolicy({ isManaged: row?.managedRemoteId != null });
}

/** A delivered Agent's policy, from its stored ownership and model pool. */
export function agentRowPolicy(
  row: (ManagedRow & { allowedModelIds?: readonly string[] | null }) | undefined,
) {
  return agentPolicy({
    isManaged: row?.managedRemoteId != null,
    allowedModelIds: (row?.allowedModelIds ?? undefined) as UniqueModelId[] | undefined,
  });
}

/**
 * Authorizes an Agent update against the row read in the same write transaction, so a stale form
 * cannot overwrite a field the organization changed meanwhile.
 */
export function assertAgentUpdate(
  row: ManagedRow & { allowedModelIds: readonly string[] | null },
  updates: Readonly<Record<string, unknown>>,
): void {
  const policy = agentRowPolicy(row);
  const locked = Object.keys(updates).filter((field) => !policy.canEdit(field));
  denyUnless(locked.length === 0, `agent.update(${locked.join(', ')})`);
  denyUnless(
    !('model' in updates) ||
      policy.allowedModelIds === null ||
      policy.allowedModelIds.includes(updates.model as UniqueModelId),
    'agent.update(model)',
  );
}
