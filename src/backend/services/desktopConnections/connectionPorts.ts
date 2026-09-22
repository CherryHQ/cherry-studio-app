import type { DesktopConnectionRow } from '@/backend/data/db/schemas';
import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';

import type { DesktopSession } from './DesktopSession';

export type DesktopDomain = 'agent' | 'configuration';
export type DesktopLeaseState = {
  status: 'connecting' | 'ready' | 'offline' | 'suspended' | 'retired';
  reason?: 'not-authorized' | 'needs-repair' | 'replaced' | 'removed' | 'stopped';
};
/** Backend-only domain ownership; frontend modules receive credential-free projections. */
export interface DesktopDomainLease {
  readonly connectionId: string;
  readonly grantId: string;
  readonly scope: string;
  readonly signal: AbortSignal;
  getSnapshot(): DesktopLeaseState;
  subscribe(listener: () => void): () => void;
  ready(signal: AbortSignal): Promise<DesktopSession>;
  release(): void;
}
export type DesktopConnectionStore = Pick<DesktopConnectionService, 'getRow' | 'updateStatus'>;
export type DesktopConnectionTarget = Pick<
  DesktopConnectionRow,
  'addresses' | 'desktopIdentity' | 'port'
>;
export interface DesktopConnections {
  retain(id: string, domain: DesktopDomain, signal: AbortSignal): Promise<DesktopDomainLease>;
  revoke(id: string, domain: DesktopDomain, grantId: string): Promise<void>;
}
