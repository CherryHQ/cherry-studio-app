import type { DesktopConnectionService } from '@/backend/data/services/DesktopConnectionService';

import type { DesktopSession } from './DesktopSession';

export type DesktopDomain = 'agent' | 'configuration';
export type DesktopLeaseState = {
  status: 'connecting' | 'ready' | 'offline' | 'suspended' | 'retired';
  reason?:
    | 'not-authorized'
    | 'needs-repair'
    | 'replaced'
    | 'removed'
    | 'stopped'
    | 'no-location'
    | 'discovery-unavailable'
    | 'unreachable'
    | 'unsupported-version';
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
export type DesktopConnectionTarget = {
  desktopIdentity: string;
  addresses: string[];
  port: number;
};
export type DesktopBindingInvalidation = {
  connectionId: string;
  domain?: DesktopDomain;
  grantId?: string;
};
export interface DesktopConnections {
  subscribeInvalidation(listener: (event: DesktopBindingInvalidation) => void): () => void;
  retain(id: string, domain: DesktopDomain, signal: AbortSignal): Promise<DesktopDomainLease>;
  revoke(id: string, domain: DesktopDomain, grantId: string): Promise<void>;
}
