import type { ProviderAccountService } from '@/backend/data/services/ProviderAccountService';
import type {
  ProviderAccountCapabilities,
  ProviderAccountIdentity,
  ProviderAccountStatus,
  ProviderSignInInteraction,
} from '@/shared/contracts/providerAccounts';

/** A bound serving implementation supplies account flows without exposing its SDK to this module. */
export interface ProviderAccountAdapter {
  configure(providers: Pick<ProviderAccountService, 'get'>): void;
  getCapabilities(provider: ProviderAccountIdentity): ProviderAccountCapabilities | undefined;
  getStatus(providerId: string): Promise<ProviderAccountStatus>;
  signIn(providerId: string, interaction: ProviderSignInInteraction): Promise<void>;
  refresh(providerId: string): Promise<ProviderAccountStatus>;
  logout(providerId: string): Promise<void>;
  stop(): Promise<void>;
}
