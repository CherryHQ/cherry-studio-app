import type { AccountsPortal, ProfileChoice } from '@cherryinternal/accounts-portal/client';
import { loggerService } from '@logger';
import * as z from 'zod';

import { Emitter } from '@/backend/core/lifecycle/event';
import { isHttpError } from '@/backend/services/http';
import {
  type EnterpriseAccountState,
  EnterpriseError,
  type EnterpriseModule,
  normalizeEnterpriseAddress,
} from '@/shared/contracts/enterprise';
import {
  type ActiveProfile,
  type EnterpriseIdentity,
  LOCAL_PROFILE,
} from '@/shared/data/activeProfile';

import type { EnterpriseApi } from '../enterpriseApi';

const logger = loggerService.withContext('EnterpriseAccount');

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

export interface EnterpriseAccountOptions {
  /** Null when the build carries no Accounts Portal configuration. */
  portal: Portal | null;
  issuer: string;
  /** The profile this runtime serves. */
  active: ActiveProfile;
  profiles: {
    resolve(identity: EnterpriseIdentity): ActiveProfile;
    setActive(profile: ActiveProfile): void;
  };
  address: { read(): string; write(address: string): void };
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
 * The installation's Accounts Portal session. Selecting another profile writes the installation
 * registry and reloads; this object never swaps data stores in place.
 */
export class EnterpriseAccount implements EnterpriseModule {
  private readonly changes = new Emitter<void>();
  private state: EnterpriseAccountState;

  constructor(private readonly options: EnterpriseAccountOptions) {
    this.state = {
      isAvailable: options.portal !== null,
      isEnterprise: options.active.identity !== null,
      needsSignIn: false,
      isBusy: false,
      address: options.address.read(),
    };
    options.portal?.subscribe((session) => {
      if (session._tag === 'signedIn') this.update({ name: session.name });
      else if (this.state.isEnterprise) this.update({ needsSignIn: true });
    });
  }

  readonly getState = () => this.state;
  readonly subscribe = (listener: () => void) => {
    const subscription = this.changes.event(listener);
    return () => subscription.dispose();
  };

  readonly signIn = () =>
    this.busy(async () => {
      const portal = this.requirePortal();
      const address = normalizeEnterpriseAddress(this.state.address);
      const { url, redirectUri } = await portal.beginSignIn();
      const result = await this.options.openBrowser(url, redirectUri);
      if (!result) return;
      const session = await portal.completeSignIn(result);
      if (session._tag !== 'signedIn' || session.profile?.product !== 'enterprise')
        throw new EnterpriseError('unsupported-profile');
      const choice = session.profile;
      const configuration = await this.options
        .createApi(address, () => portal.getProductToken(address, choice))
        .getConfiguration()
        .catch((error: unknown) => {
          throw new EnterpriseError(isAuthenticationRejection(error) ? 'rejected' : 'connection');
        });
      const server = z.object({ serverUniqueId: z.string().min(1) }).safeParse(configuration);
      if (!server.success) throw new EnterpriseError('connection');
      const profile = this.options.profiles.resolve({
        deployment: server.data.serverUniqueId,
        issuer: this.options.issuer,
        subject: session.subject,
        productProfileId: choice.profileId,
      });
      await this.open(profile);
    });

  readonly signOut = () =>
    this.busy(async () => {
      // The SDK forgets local credentials even when revocation cannot reach the server.
      await this.requirePortal().signOut();
      await this.open(LOCAL_PROFILE);
    });

  readonly useLocal = () => this.busy(() => this.open(LOCAL_PROFILE));

  readonly setAddress = (address: string) => {
    const normalized = normalizeEnterpriseAddress(address);
    this.options.address.write(normalized);
    this.update({ address: normalized });
  };

  /** A product token for the active enterprise profile; the SDK refreshes and caches it. */
  readonly getProductToken = async (): Promise<string> => {
    const identity = this.options.active.identity;
    if (!identity) throw new EnterpriseError('unsupported-profile');
    const choice: ProfileChoice = { product: 'enterprise', profileId: identity.productProfileId };
    try {
      const address = normalizeEnterpriseAddress(this.state.address);
      return await this.requirePortal().getProductToken(address, choice);
    } catch (error) {
      if (isAuthenticationRejection(error)) this.update({ needsSignIn: true });
      throw error;
    }
  };

  /** Records a server-side rejection observed by an authenticated enterprise request. */
  readonly reportRejected = () => this.update({ needsSignIn: true });

  /**
   * Confirms the restored session belongs to this profile. Offline launches keep working; only
   * an explicit rejection asks the user to sign in again.
   */
  readonly verify = async (): Promise<void> => {
    const identity = this.options.active.identity;
    if (!identity || !this.options.portal) return;
    await this.options.portal.ready;
    const session = this.options.portal.getState();
    if (
      session._tag !== 'signedIn' ||
      session.subject !== identity.subject ||
      session.profile?.profileId !== identity.productProfileId
    ) {
      this.update({ needsSignIn: true });
      return;
    }
    this.update({ name: session.name });
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
    if (!this.options.portal) throw new EnterpriseError('unavailable');
    return this.options.portal;
  }

  private async busy(work: () => Promise<void>): Promise<void> {
    if (this.state.isBusy) return;
    this.update({ isBusy: true });
    try {
      await work();
    } finally {
      this.update({ isBusy: false });
    }
  }

  private update(patch: Partial<EnterpriseAccountState>): void {
    this.state = { ...this.state, ...patch };
    this.changes.fire();
  }
}
