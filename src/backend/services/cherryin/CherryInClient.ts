import * as z from 'zod';

import {
  CHERRYIN_PROVIDER_ID,
  resolveCherryInContext,
} from '@/backend/services/oauth/CherryInOAuthConfig';
import type { OAuthAuthenticatedFetch } from '@/backend/services/oauth/runtime/types';
import type { CherryInAccount, CherryInModule, CherryInProfile } from '@/shared/contracts';
import { loggerService } from '@/shared/core/logger/LoggerService';
import { OAuthServiceError } from '@/shared/oauth';

const logger = loggerService.withContext('CherryInClient');

/** Conversion factor from quota units to balance/spend (1 unit = 500000 quota) */
const QUOTA_TO_BALANCE_DIVISOR = 500000;

const BalanceResponseSchema = z.object({
  data: z.object({
    quota: z.number(),
    used_quota: z.number(),
  }),
  success: z.boolean(),
});

const UserSelfProfileSchema = z.object({
  display_name: z.string().optional().nullable(),
  email: z.string().optional().nullable(),
  group: z.string().optional().nullable(),
  username: z.string().optional().nullable(),
});

const UserSelfResponseSchema = z
  .union([
    z.object({ data: UserSelfProfileSchema.nullable() }).transform((payload) => payload.data),
    UserSelfProfileSchema.transform((profile) => profile),
  ])
  .transform((profile): CherryInProfile | null => {
    if (!profile) return null;

    return {
      displayName: profile.display_name ?? null,
      email: profile.email ?? null,
      group: profile.group ?? null,
      username: profile.username ?? null,
    };
  });

type CherryInOAuthRuntime = {
  authenticatedFetch: OAuthAuthenticatedFetch;
  hasToken(providerId: string): Promise<boolean>;
};

export type CherryInClientDependencies = {
  oauth: CherryInOAuthRuntime;
};

/**
 * CherryIN's own REST surface (balance, profile). The OAuth session it rides on
 * belongs to `OAuthRuntimeService`; this only knows how to read an account.
 */
export class CherryInClient implements CherryInModule {
  constructor(private readonly dependencies: CherryInClientDependencies) {}

  async getBalance(requestedApiHost?: string): Promise<CherryInAccount | null> {
    // Validates the host against the allowlist and falls back to the primary one.
    const { apiHost } = resolveCherryInContext({ apiHost: requestedApiHost });

    if (!(await this.dependencies.oauth.hasToken(CHERRYIN_PROVIDER_ID))) {
      return null;
    }

    try {
      const response = await this.request(apiHost, '/api/v1/oauth/balance');

      if (!response.ok) {
        throw new OAuthServiceError(
          `HTTP ${response.status} from /api/v1/oauth/balance`,
          undefined,
          'BalanceFetchFailed',
        );
      }

      const parsed = BalanceResponseSchema.parse(await response.json());

      if (!parsed.success) {
        throw new OAuthServiceError('API returned success: false', undefined, 'BalanceApiError');
      }

      const { quota, used_quota: usedQuota } = parsed.data;
      const profile = await this.getProfile(apiHost);

      return {
        balance: quota / QUOTA_TO_BALANCE_DIVISOR,
        monthlySpend: usedQuota / QUOTA_TO_BALANCE_DIVISOR,
        monthlyUsageTokens: null,
        profile,
      };
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.error('Invalid balance response format', { issues: error.issues });
        throw new OAuthServiceError(
          'Invalid response format from server',
          error,
          'BalanceParseError',
        );
      }

      logger.error('Failed to get balance', error as Error);
      const detail = error instanceof Error && error.message ? `: ${error.message}` : '';
      throw new OAuthServiceError(`Failed to get balance${detail}`, error, 'BalanceFetchFailed');
    }
  }

  /** Profile is supplementary: a failure degrades the account card, not the call. */
  private async getProfile(apiHost: string): Promise<CherryInProfile | null> {
    try {
      const response = await this.request(apiHost, '/api/user/self');

      if (!response.ok) {
        logger.warn('Failed to fetch CherryIN profile', { status: response.status });
        return null;
      }

      return UserSelfResponseSchema.parse(await response.json());
    } catch (error) {
      if (error instanceof z.ZodError) {
        logger.warn('Failed to parse CherryIN profile response', { issues: error.issues });
      } else {
        logger.warn('Failed to fetch CherryIN profile', error as Error);
      }

      return null;
    }
  }

  private request(apiHost: string, endpoint: string): Promise<Response> {
    return this.dependencies.oauth.authenticatedFetch(
      CHERRYIN_PROVIDER_ID,
      (credentials) => ({
        init: {
          headers: {
            Authorization: `Bearer ${credentials.accessToken}`,
            'Content-Type': 'application/json',
          },
          method: 'GET',
        },
        input: `${apiHost}${endpoint}`,
      }),
      (input, init) => fetch(input, init),
      { context: { apiHost } },
    );
  }
}
