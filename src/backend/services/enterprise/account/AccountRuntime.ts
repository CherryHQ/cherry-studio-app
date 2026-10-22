import type { AccountsPortal, ProfileChoice } from '@cherryinternal/accounts-portal/client';
import { loggerService } from '@logger';
import * as z from 'zod';

import { Emitter } from '@/backend/core/lifecycle/event';
import { isHttpError } from '@/backend/services/http';
import {
  AccountError,
  type AccountModule,
  type AccountState,
  normalizeEnterpriseAddress,
} from '@/shared/contracts/account';
import {
  type ActiveProfile,
  type EnterpriseIdentity,
  LOCAL_PROFILE,
} from '@/shared/data/activeProfile';

import type { EnterpriseApi } from '../enterpriseApi';

const logger = loggerService.withContext('AccountRuntime');

type Portal = Pick<
  AccountsPortal,
  | 'ready'
  | 'getState'
  | 'subscribe'
  | 'beginSignIn'
  | 'completeSignIn'
  | 'getProductToken'
  | 'signOut'
>;

export interface AccountRuntimeOptions {
  /** Null when the build carries no Accounts Portal configuration. */
  portal: Portal | null;
  issuer: string;
  /** The enterprise cloud address used unless the user enters a private deployment. */
  defaultAddress: string;
  /** The profile this runtime serves. */
  active: ActiveProfile;
  profiles: {
    resolve(identity: EnterpriseIdentity, address: string): ActiveProfile;
    setActive(profile: ActiveProfile): void;
  };
  prompt: { read(): boolean; write(): void };
  createApi(baseUrl: string, getToken: () => Promise<string>): EnterpriseApi;
  openBrowser(url: string, redirectUri: string): Promise<string | null>;
  /** Restarts JavaScript so the selected profile's stores open from scratch. */
  reload(): Promise<void>;
}

/** Whether the server refused the session, as opposed to being unreachable. */
export function isAuthenticationRejection(error: unknown): boolean {
  if (isHttpError(error)) return error.status === 401 || error.status === 403;
  if (error instanceof Error && error.name === 'AccountsPortalError') {
    const { code, status } = error as Error & { code: string; status: number };
    return code === 'signed_out' || code === 'no_profile' || status === 401 || status === 403;
  }
  return false;
}

/**
 * The installation's Accounts Portal session. Opening another profile writes the installation
 * registry and reloads; this object never swaps data stores in place.
 */
export class AccountRuntime implements AccountModule {
  private readonly changes = new Emitter<void>();
  private state: AccountState;

  constructor(private readonly options: AccountRuntimeOptions) {
    this.state = {
      isAvailable: options.portal !== null,
      isSignedIn: false,
      isEnterprise: options.active.identity !== null,
      needsSignIn: false,
      hasPrompted: options.prompt.read(),
      isBusy: false,
    };
    options.portal?.subscribe((session) => {
      const isSignedIn = session._tag === 'signedIn';
      this.update({
        isSignedIn,
        name: isSignedIn ? session.name : undefined,
        ...(!isSignedIn && this.state.isEnterprise && { needsSignIn: true }),
      });
    });
  }

  readonly getState = () => this.state;
  readonly subscribe = (listener: () => void) => {
    const subscription = this.changes.event(listener);
    return () => subscription.dispose();
  };

  readonly signIn = async ({ address }: { address?: string } = {}) =>
    (await this.busy(async () => {
      const portal = this.requirePortal();
      const enterpriseAddress = normalizeEnterpriseAddress(address ?? this.options.defaultAddress);
      const { url, redirectUri } = await portal.beginSignIn();
      const result = await this.options.openBrowser(url, redirectUri);
      if (!result) return false;
      const session = await portal.completeSignIn(result);
      this.dismissPrompt();
      if (session._tag !== 'signedIn' || session.profile?.product !== 'enterprise') {
        // A community account keeps the installation's own local data.
        if (this.state.isEnterprise) await this.open(LOCAL_PROFILE);
        return session._tag === 'signedIn';
      }
      const choice = session.profile;
      const configuration = await this.options
        .createApi(enterpriseAddress, () => portal.getProductToken(enterpriseAddress, choice))
        .getConfiguration()
        .catch((error: unknown) => {
          throw new AccountError(isAuthenticationRejection(error) ? 'rejected' : 'connection');
        });
      const server = z.object({ serverUniqueId: z.string().min(1) }).safeParse(configuration);
      if (!server.success) throw new AccountError('connection');
      const profile = this.options.profiles.resolve(
        {
          deployment: server.data.serverUniqueId,
          issuer: this.options.issuer,
          subject: session.subject,
          productProfileId: choice.profileId,
        },
        enterpriseAddress,
      );
      await this.open(profile);
      return false;
    })) ?? false;

  readonly signOut = async () => {
    await this.busy(async () => {
      // The SDK forgets local credentials even when revocation cannot reach the server.
      await this.requirePortal().signOut();
      if (this.state.isEnterprise) await this.open(LOCAL_PROFILE);
    });
  };

  readonly useLocal = async () => {
    await this.busy(() => this.open(LOCAL_PROFILE));
  };

  readonly dismissPrompt = () => {
    if (this.state.hasPrompted) return;
    this.options.prompt.write();
    this.update({ hasPrompted: true });
  };

  /** A product token for the active enterprise profile; the SDK refreshes and caches it. */
  readonly getProductToken = async (): Promise<string> => {
    const { identity, address } = this.options.active;
    if (!identity) throw new AccountError('rejected');
    const choice: ProfileChoice = { product: 'enterprise', profileId: identity.productProfileId };
    try {
      return await this.requirePortal().getProductToken(address, choice);
    } catch (error) {
      if (isAuthenticationRejection(error)) this.reportRejected();
      throw error;
    }
  };

  /** Records a server-side rejection observed by an authenticated enterprise request. */
  readonly reportRejected = () => this.update({ needsSignIn: true });

  /**
   * Confirms the restored session belongs to this profile. Offline launches keep working; only
   * an explicit rejection sends the user back to sign-in.
   */
  readonly verify = async (): Promise<void> => {
    const { portal, active } = this.options;
    if (!portal) return;
    await portal.ready;
    const session = portal.getState();
    this.update({
      isSignedIn: session._tag === 'signedIn',
      name: session._tag === 'signedIn' ? session.name : undefined,
    });
    if (!active.identity) return;
    if (
      session._tag !== 'signedIn' ||
      session.subject !== active.identity.subject ||
      session.profile?.profileId !== active.identity.productProfileId
    ) {
      this.reportRejected();
      return;
    }
    await this.getProductToken().catch((error: unknown) => {
      if (!isAuthenticationRejection(error))
        logger.warn('Could not verify the session', error as Error);
    });
  };

  private async open(profile: ActiveProfile): Promise<void> {
    this.options.profiles.setActive(profile);
    await this.options.reload();
  }

  private requirePortal(): Portal {
    if (!this.options.portal) throw new AccountError('unavailable');
    return this.options.portal;
  }

  private async busy<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (this.state.isBusy) return undefined;
    this.update({ isBusy: true });
    try {
      return await work();
    } finally {
      this.update({ isBusy: false });
    }
  }

  private update(patch: Partial<AccountState>): void {
    this.state = { ...this.state, ...patch };
    this.changes.fire();
  }
}
