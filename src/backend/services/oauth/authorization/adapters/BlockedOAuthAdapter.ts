import { OAuthServiceError } from '@/shared/oauth';

import type { OAuthFlowAdapter } from '../types';

export class BlockedOAuthAdapter implements OAuthFlowAdapter {
  readonly flowType = 'blocked' as const;

  constructor(readonly providerId: string) {}

  async getStatus() {
    return { accountId: null, isAuthenticated: false, isConfigured: false };
  }

  async logout(): Promise<void> {}

  async start(): Promise<never> {
    throw new OAuthServiceError(
      `${this.providerId} OAuth is not available on mobile`,
      undefined,
      'OAuthFlowBlocked',
    );
  }
}
