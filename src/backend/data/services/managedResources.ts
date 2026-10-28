import { isEnterpriseProfile } from '@/shared/data/activeProfile';
import { DataApiErrorFactory } from '@/shared/data/api/errors';
import { MANAGED_AGENT_EDITABLE_FIELDS } from '@/shared/data/types/agent';

const MANAGED = 'managed by the enterprise server';

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

/** Enterprise profiles receive every provider and model from the server; users cannot edit them. */
export function assertProvidersEditable(operation: string): void {
  if (isEnterpriseProfile()) throw DataApiErrorFactory.invalidOperation(operation, MANAGED);
}

/** Agents, Skills and MCP servers the enterprise server delivers are read-only. */
export function assertUserOwned(isManaged: boolean | undefined, operation: string): void {
  if (isManaged) throw DataApiErrorFactory.invalidOperation(operation, MANAGED);
}

/** A managed Agent accepts changes to the user-adjustable fields only. */
export function assertManagedAgentUpdate(
  isManaged: boolean | undefined,
  fields: readonly string[],
): void {
  if (!isManaged) return;
  const locked = fields.filter(
    (field) => !(MANAGED_AGENT_EDITABLE_FIELDS as readonly string[]).includes(field),
  );
  if (locked.length)
    throw DataApiErrorFactory.invalidOperation(`agent.update(${locked.join(', ')})`, MANAGED);
}
