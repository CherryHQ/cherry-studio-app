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
  type PrivateSignIn,
} from '@/shared/contracts/account';
import {
  type ActiveProfile,
  type EnterpriseIdentity,
  LOCAL_PROFILE,
} from '@/shared/data/activeProfile';

import type { EnterpriseApi } from '../enterpriseApi';
import {
  type createPrivateAccountApi,
  type PrivateCredentials,
  PrivateCredentialsSchema,
  PrivateUserSchema,
} from './privateAccountApi';

const logger = loggerService.withContext('AccountRuntime');
const ServerIdentitySchema = z.object({ serverUniqueId: z.string().min(1) });

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
  /** The enterprise cloud address used by Accounts Portal sign-in. */
  defaultAddress: string;
  /** The profile this runtime serves. */
  active: ActiveProfile;
  profiles: {
    resolve(identity: EnterpriseIdentity, address: string): ActiveProfile;
    setActive(profile: ActiveProfile): void;
  };
  prompt: { read(): boolean; write(): void };
  createApi(
    baseUrl: string,
    getToken: () => Promise<string>,
    refreshToken?: (rejectedToken: string) => Promise<string | null>,
  ): EnterpriseApi;
  createPrivateApi: typeof createPrivateAccountApi;
  /** SecureStore entries scoped to the resolved private data profile. Never stores passwords. */
  credentials: {
    read(profileId: string): Promise<string | null>;
    write(profileId: string, value: string): Promise<void>;
    delete(profileId: string): Promise<void>;
  };
  openBrowser(url: string, redirectUri: string): Promise<string | null>;
  /** Restarts JavaScript so the selected profile's stores open from scratch. */
  reload(): Promise<void>;
}

/** Whether the server refused the session, as opposed to being unreachable. */
export function isAuthenticationRejection(error: unknown): boolean {
  if (error instanceof AccountError) return error.code === 'rejected';
  if (isHttpError(error)) return error.status === 401 || error.status === 403;
  if (error instanceof Error && error.name === 'AccountsPortalError') {
    const { code, status } = error as Error & { code: string; status: number };
    return code === 'signed_out' || code === 'no_profile' || status === 401 || status === 403;
  }
  return false;
}

/**
 * The installation's cloud or private session. Opening another profile writes the installation
 * registry and reloads; this object never swaps data stores in place.
 */
export class AccountRuntime implements AccountModule {
  private readonly changes = new Emitter<void>();
  private state: AccountState;
  private privateCredentials: Promise<PrivateCredentials> | undefined;
  private privateRefresh: Promise<string> | undefined;
  private credentialRevision = 0;
  private isPrivateSessionClosed = false;

  constructor(private readonly options: AccountRuntimeOptions) {
    this.state = {
      isAvailable: options.portal !== null,
      isSignedIn: false,
      isEnterprise: options.active.identity !== null,
      needsSignIn: false,
      hasPrompted: options.prompt.read(),
      isBusy: false,
      privateAddress:
        options.active.identity && 'authentication' in options.active.identity
          ? options.active.address
          : undefined,
    };
    options.portal?.subscribe((session) => {
      if (this.state.privateAddress) return;
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

  readonly signIn = async (options?: PrivateSignIn) =>
    (await this.busy(async () => {
      if (options) return this.signInPrivate(options);
      const portal = this.requirePortal();
      const enterpriseAddress = normalizeEnterpriseAddress(this.options.defaultAddress);
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
      const server = ServerIdentitySchema.safeParse(configuration);
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
      if (this.state.privateAddress) {
        // An in-flight rotation must finish before deletion, so it cannot restore signed-out tokens.
        this.isPrivateSessionClosed = true;
        this.credentialRevision++;
        await this.privateRefresh?.catch(() => {});
        await this.options.credentials.delete(this.options.active.id);
        this.privateCredentials = undefined;
        this.update({ isSignedIn: false, name: undefined });
      } else {
        // The SDK forgets local credentials even when revocation cannot reach the server.
        await this.requirePortal().signOut();
      }
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

  /** A token for the active enterprise profile; private tokens rotate on an API's 401 response. */
  readonly getProductToken = async (): Promise<string> => {
    const { identity, address } = this.options.active;
    if (!identity) throw new AccountError('rejected');
    try {
      if ('authentication' in identity) return (await this.readPrivateCredentials()).accessToken;
      const choice: ProfileChoice = { product: 'enterprise', profileId: identity.productProfileId };
      return await this.requirePortal().getProductToken(address, choice);
    } catch (error) {
      if (isAuthenticationRejection(error)) this.reportRejected();
      throw error;
    }
  };

  /** Concurrent 401s share one rotation; a late failure reuses the already-rotated token. */
  readonly refreshProductToken = async (rejectedToken: string): Promise<string | null> => {
    if (!this.state.privateAddress) return null;
    this.privateRefresh ??= this.refreshPrivateCredentials(rejectedToken)
      .catch((error: unknown) => {
        if (isAuthenticationRejection(error)) this.reportRejected();
        throw error;
      })
      .finally(() => {
        this.privateRefresh = undefined;
      });
    return this.privateRefresh;
  };

  /** Records a server-side rejection observed by an authenticated enterprise request. */
  readonly reportRejected = () => this.update({ needsSignIn: true });

  /**
   * Confirms the restored session belongs to this profile. Offline launches keep working; only
   * an explicit rejection sends the user back to sign-in.
   */
  readonly verify = async (): Promise<void> => {
    const { portal, active } = this.options;
    if (active.identity && 'authentication' in active.identity) {
      try {
        const credentials = await this.readPrivateCredentials();
        this.update({
          isSignedIn: true,
          name: credentials.user.username ?? active.identity.subject,
        });
        const api = this.options.createApi(
          active.address,
          this.getProductToken,
          this.refreshProductToken,
        );
        const user = PrivateUserSchema.safeParse(await api.getUser());
        const server = ServerIdentitySchema.safeParse(await api.getConfiguration());
        if (!user.success || !server.success) throw new AccountError('connection');
        if (
          user.data.id !== active.identity.subject ||
          server.data.serverUniqueId !== active.identity.deployment
        )
          throw new AccountError('rejected');
        this.update({ name: user.data.username ?? user.data.id });
      } catch (error) {
        if (isAuthenticationRejection(error)) this.reportRejected();
        else logger.warn('Could not verify the private session', error as Error);
      }
      return;
    }
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

  private async signInPrivate({ address, username, password }: PrivateSignIn): Promise<boolean> {
    const enterpriseAddress = normalizeEnterpriseAddress(address);
    if (!username.trim() || !password) throw new AccountError('credentials');
    try {
      const tokens = await this.options
        .createPrivateApi(enterpriseAddress)
        .signIn(username.trim(), password);
      const api = this.options.createApi(enterpriseAddress, async () => tokens.accessToken);
      const user = PrivateUserSchema.safeParse(await api.getUser());
      const server = ServerIdentitySchema.safeParse(await api.getConfiguration());
      if (!user.success || !server.success) throw new AccountError('connection');
      if (
        user.data.id !== tokens.user.id ||
        (tokens.serverUniqueId && tokens.serverUniqueId !== server.data.serverUniqueId)
      )
        throw new AccountError('rejected');
      const profile = this.options.profiles.resolve(
        {
          authentication: 'password',
          deployment: server.data.serverUniqueId,
          subject: user.data.id,
        },
        enterpriseAddress,
      );
      const credentials: PrivateCredentials = {
        ...tokens,
        user: user.data,
        serverUniqueId: server.data.serverUniqueId,
      };
      // Reauthentication wins over any rotation started by this profile's previous session.
      if (profile.id === this.options.active.id) {
        this.isPrivateSessionClosed = true;
        this.credentialRevision++;
      }
      await this.privateRefresh?.catch(() => {});
      await this.options.credentials.write(profile.id, JSON.stringify(credentials));
      if (profile.id === this.options.active.id) {
        this.privateCredentials = Promise.resolve(credentials);
        this.isPrivateSessionClosed = false;
      }
      this.dismissPrompt();
      await this.open(profile);
      return false;
    } catch (error) {
      if (error instanceof AccountError) throw error;
      throw new AccountError(isAuthenticationRejection(error) ? 'credentials' : 'connection');
    }
  }

  private readPrivateCredentials(): Promise<PrivateCredentials> {
    if (this.isPrivateSessionClosed) return Promise.reject(new AccountError('rejected'));
    this.privateCredentials ??= this.options.credentials
      .read(this.options.active.id)
      .then((raw) => {
        let value: unknown;
        try {
          value = raw ? JSON.parse(raw) : null;
        } catch {
          throw new AccountError('rejected');
        }
        const parsed = PrivateCredentialsSchema.safeParse(value);
        const identity = this.options.active.identity;
        if (
          !parsed.success ||
          !identity ||
          parsed.data.user.id !== identity.subject ||
          parsed.data.serverUniqueId !== identity.deployment
        )
          throw new AccountError('rejected');
        return parsed.data;
      });
    return this.privateCredentials;
  }

  private async refreshPrivateCredentials(rejectedToken: string): Promise<string> {
    const revision = this.credentialRevision;
    const current = await this.readPrivateCredentials();
    if (current.accessToken !== rejectedToken) return current.accessToken;
    if (!current.refreshToken) throw new AccountError('rejected');
    const refreshed = await this.options
      .createPrivateApi(this.state.privateAddress!)
      .refresh(current.refreshToken);
    if (
      this.isPrivateSessionClosed ||
      revision !== this.credentialRevision ||
      refreshed.user.id !== current.user.id ||
      (refreshed.serverUniqueId && refreshed.serverUniqueId !== current.serverUniqueId)
    )
      throw new AccountError('rejected');
    const credentials: PrivateCredentials = {
      ...refreshed,
      refreshToken: refreshed.refreshToken ?? current.refreshToken,
      serverUniqueId: current.serverUniqueId,
    };
    await this.options.credentials.write(this.options.active.id, JSON.stringify(credentials));
    this.privateCredentials = Promise.resolve(credentials);
    return credentials.accessToken;
  }

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
