import type {
  AccountsPortal,
  AuthState,
  ProfileChoice,
} from '@cherryinternal/accounts-portal/client';
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

import type { EnterpriseApi, EnterpriseSession } from '../enterpriseApi';
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
  | 'getAccount'
  | 'listProfiles'
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
    resolve(identity: EnterpriseIdentity, address: string, displayName?: string): ActiveProfile;
    setActive(profile: ActiveProfile): void;
  };
  prompt: { read(): boolean; write(): void };
  /**
   * Set when a sign-out could not end the portal session, so the browser may still remember it.
   * The next browser sign-in then asks who signs in instead of reusing that session.
   */
  browserSession: { isStale(): boolean; setStale(stale: boolean): void };
  createApi(baseUrl: string, session: EnterpriseSession): EnterpriseApi;
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
  private callback: { url: string; result: Promise<boolean> } | undefined;
  private redirectRouted = false;

  constructor(private readonly options: AccountRuntimeOptions) {
    const { active, portal } = options;
    const isCloudProfile = active.identity !== null && !('authentication' in active.identity);
    const isPrivateProfile = active.identity !== null && 'authentication' in active.identity;
    this.state = {
      isCloudSignInAvailable: portal !== null,
      isSignedIn: false,
      isEnterprise: active.identity !== null,
      isRestoringSession: isPrivateProfile || (portal !== null && isCloudProfile),
      needsSignIn: portal === null && isCloudProfile,
      hasPrompted: options.prompt.read(),
      isBusy: false,
      privateAddress:
        active.identity && 'authentication' in active.identity ? active.address : undefined,
      organizationName: active.identity ? active.displayName : undefined,
    };
    if (portal) {
      portal.subscribe((session) => {
        if (!this.state.isRestoringSession) this.updateCloudSession(session);
      });
      void portal.ready.then(
        () => {
          this.updateCloudSession(portal.getState());
          if (!isPrivateProfile) this.update({ isRestoringSession: false });
        },
        () => {
          if (!isPrivateProfile)
            this.update({
              isRestoringSession: false,
              ...(isCloudProfile && { needsSignIn: true }),
            });
        },
      );
    }
  }

  readonly getState = () => this.state;
  readonly subscribe = (listener: () => void) => {
    const subscription = this.changes.event(listener);
    return () => subscription.dispose();
  };

  readonly signIn = async (options?: PrivateSignIn) =>
    (await this.busy(async () => {
      if (options) return this.signInPrivate(options);
      return this.openCloudSignIn(true);
    })) ?? false;

  readonly switchSpace = async () => (await this.busy(() => this.openCloudSignIn(false))) ?? false;

  private async openCloudSignIn(changeAccount: boolean): Promise<boolean> {
    const portal = this.requirePortal();
    this.callback = undefined;
    this.redirectRouted = false;
    const { url, redirectUri } = await portal.beginSignIn({
      forceLogin:
        (changeAccount && portal.getState()._tag === 'signedIn') ||
        this.state.needsSignIn ||
        this.options.browserSession.isStale(),
    });
    const result = await this.options.openBrowser(url, redirectUri);
    if (!result) return false;
    const stayed = await this.finishRedirect(result);
    // Android may also route the callback. That screen owns navigation in that case.
    return stayed && !this.redirectRouted;
  }

  readonly receiveRedirect = (url: string): Promise<boolean> => {
    this.redirectRouted = true;
    return this.finishRedirect(url);
  };

  private finishRedirect(url: string): Promise<boolean> {
    if (this.callback) {
      if (this.callback.url === url) return this.callback.result;
      return Promise.reject(new AccountError('rejected'));
    }
    const ownsBusy = !this.state.isBusy;
    if (ownsBusy) this.update({ isBusy: true });
    const result = this.completeCloudSignIn(url).finally(() => {
      if (ownsBusy) this.update({ isBusy: false });
    });
    // Keep the result until another sign-in starts; a late browser/deep-link duplicate is consumed once.
    this.callback = { url, result };
    return result;
  }

  private async completeCloudSignIn(url: string): Promise<boolean> {
    const portal = this.requirePortal();
    const address = normalizeEnterpriseAddress(this.options.defaultAddress);
    let target: ActiveProfile | undefined;
    let proposed: AuthState | undefined;
    try {
      const session = await portal.completeSignIn(url, {
        validate: async (candidate) => {
          proposed = candidate.state;
          if (!proposed.subject || !proposed.profile?.profileId) throw new AccountError('rejected');
          await candidate.getAccount();
          if (proposed.profile.product === 'cloud') {
            target = LOCAL_PROFILE;
            return;
          }
          if (proposed.profile.product !== 'enterprise') throw new AccountError('rejected');
          const api = this.options.createApi(address, {
            getProductToken: () => candidate.getProductToken(address),
          });
          const configuration = ServerIdentitySchema.safeParse(await api.getConfiguration());
          if (!configuration.success) throw new AccountError('connection');
          target = this.options.profiles.resolve(
            {
              deployment: configuration.data.serverUniqueId,
              issuer: this.options.issuer,
              subject: proposed.subject,
              productProfileId: proposed.profile.profileId,
            },
            address,
          );
        },
      });
      if (session._tag !== 'signedIn' || !session.profile || !target)
        throw new AccountError('rejected');
      this.options.browserSession.setStale(false);
      this.dismissPrompt();
      if (target.identity) {
        // Presentation lookup uses the newly committed account, never the previous account's token.
        const organization = await portal.listProfiles().then(
          ({ profiles }) =>
            profiles.find(
              (entry) => entry.product === 'enterprise' && entry.id === session.profile?.profileId,
            )?.displayName,
          () => undefined,
        );
        if (organization)
          target = this.options.profiles.resolve(target.identity, address, organization);
      }
      if (target.id === this.options.active.id) {
        this.update({ needsSignIn: false });
        this.updateCloudSession(session);
        return true;
      }
      await this.open(target);
      return false;
    } catch (error) {
      // A refused admission for the open organization is also a refusal of that identity.
      if (proposed && this.matchesCloudProfile(proposed) && isAuthenticationRejection(error))
        this.reportRejected();
      // Other candidate failures leave the old session intact and never lift a prior rejection.
      if (error instanceof AccountError) throw error;
      throw new AccountError(isAuthenticationRejection(error) ? 'rejected' : 'connection');
    }
  }

  readonly signOut = async () => {
    this.callback = undefined;
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
        await this.endCloudSession();
      }
      if (this.state.isEnterprise) await this.open(LOCAL_PROFILE);
    });
  };

  /**
   * Revokes the cloud session and ends the portal's browser sign-in. The SDK forgets local
   * credentials even when the server is unreachable; the browser may then still remember it.
   */
  private async endCloudSession(): Promise<void> {
    const { loggedOut } = await this.requirePortal()
      .signOut()
      .catch(() => ({ loggedOut: false }));
    if (!loggedOut) this.options.browserSession.setStale(true);
  }

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
      if ('authentication' in identity) {
        const credentials = await this.readPrivateCredentials();
        if (this.state.needsSignIn || this.isPrivateSessionClosed)
          throw new AccountError('rejected');
        return credentials.accessToken;
      }
      const portal = this.requirePortal();
      await portal.ready;
      this.assertCloudSession(portal.getState());
      const choice: ProfileChoice = { product: 'enterprise', profileId: identity.productProfileId };
      const token = await portal.getProductToken(address, choice);
      // A product entry can finish after the installation has switched accounts.
      this.assertCloudSession(portal.getState());
      return token;
    } catch (error) {
      if (isAuthenticationRejection(error)) this.reportRejected();
      throw error;
    }
  };

  /**
   * The enterprise server answered 401 to `rejectedToken`. A private session rotates it; concurrent
   * refusals share one rotation and a late one reuses the rotated token. A cloud product token has
   * no rotation, so the user must sign in again.
   */
  readonly refuseProductToken = async (rejectedToken: string): Promise<void> => {
    if (!this.state.privateAddress) return this.reportRejected();
    this.privateRefresh ??= this.refreshPrivateCredentials(rejectedToken)
      .catch((error: unknown) => {
        if (isAuthenticationRejection(error)) this.reportRejected();
        throw error;
      })
      .finally(() => {
        this.privateRefresh = undefined;
      });
    await this.privateRefresh;
  };

  /** Records a server-side rejection observed by an authenticated enterprise request. */
  readonly reportRejected = () =>
    this.update({
      needsSignIn: true,
      isSignedIn: false,
      name: undefined,
      maskedIdentifier: undefined,
    });

  /**
   * Confirms the restored session belongs to this profile. Offline launches keep working; only
   * an explicit rejection sends the user back to sign-in.
   */
  readonly verify = async (): Promise<void> => {
    const { portal, active } = this.options;
    if (active.identity && 'authentication' in active.identity) {
      const revision = this.credentialRevision;
      try {
        const credentials = await this.readPrivateCredentials();
        if (revision !== this.credentialRevision) return;
        if (this.state.needsSignIn || this.isPrivateSessionClosed)
          throw new AccountError('rejected');
        this.update({
          isRestoringSession: false,
          isSignedIn: true,
          name: credentials.user.username ?? active.identity.subject,
        });
      } catch (error) {
        if (revision !== this.credentialRevision) return;
        this.update({
          isRestoringSession: false,
          needsSignIn: true,
          isSignedIn: false,
          name: undefined,
        });
        logger.warn('Could not restore the private session', error as Error);
        return;
      }
      // A matching local credential permits offline use; network verification is independent
      // of the initial restoration gate and must not turn storage errors into offline access.
      try {
        const api = this.options.createApi(active.address, {
          getProductToken: this.getProductToken,
          refuseProductToken: this.refuseProductToken,
          reportRejected: this.reportRejected,
        });
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
        // The API's own refusals already reached the session through its interceptor.
        if (error instanceof AccountError && error.code === 'rejected') this.reportRejected();
        else logger.warn('Could not verify the private session', error as Error);
      }
      return;
    }
    if (!portal) return;
    try {
      await portal.ready;
      this.updateCloudSession(portal.getState());
      if (active.identity) await this.getProductToken();
      if (portal.getState()._tag === 'signedIn') {
        await portal.getAccount();
        this.updateCloudSession(portal.getState());
      }
    } catch (error) {
      if (!isAuthenticationRejection(error))
        logger.warn('Could not verify the session', error as Error);
    }
  };

  private matchesCloudProfile(session: AuthState): boolean {
    const { identity } = this.options.active;
    return Boolean(
      identity &&
      !('authentication' in identity) &&
      identity.issuer === this.options.issuer &&
      session._tag === 'signedIn' &&
      session.subject === identity.subject &&
      session.profile?.product === 'enterprise' &&
      session.profile.profileId === identity.productProfileId,
    );
  }

  private updateCloudSession(session: AuthState): void {
    if (this.state.privateAddress) return;
    // Community data is signed in only by a community session; an organization session left by a
    // failed enterprise sign-in does not count.
    const matchesProfile = this.state.isEnterprise
      ? this.matchesCloudProfile(session)
      : session._tag === 'signedIn' && session.profile?.product === 'cloud';
    const isSignedIn = session._tag === 'signedIn' && matchesProfile && !this.state.needsSignIn;
    this.update({
      isSignedIn,
      name: isSignedIn ? (session.account?.displayName ?? session.name) : undefined,
      maskedIdentifier: isSignedIn ? session.account?.maskedIdentifier : undefined,
      // Reauthentication reloads the profile. A later SDK notification cannot clear a rejection
      // or reopen the old profile while sign-in admission is still in progress.
      ...(this.state.isEnterprise && !matchesProfile && { needsSignIn: true }),
    });
  }

  private assertCloudSession(session: AuthState): void {
    if (this.state.needsSignIn || !this.matchesCloudProfile(session))
      throw new AccountError('rejected');
  }

  private async signInPrivate({ address, username, password }: PrivateSignIn): Promise<boolean> {
    const enterpriseAddress = normalizeEnterpriseAddress(address);
    if (!username.trim() || !password) throw new AccountError('credentials');
    try {
      const tokens = await this.options
        .createPrivateApi(enterpriseAddress)
        .signIn(username.trim(), password);
      const api = this.options.createApi(enterpriseAddress, {
        getProductToken: async () => tokens.accessToken,
      });
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
      this.dismissPrompt();
      if (profile.id === this.options.active.id) {
        // The open deployment signed in again: keep the running profile instead of reloading.
        this.privateCredentials = Promise.resolve(credentials);
        this.isPrivateSessionClosed = false;
        this.update({
          needsSignIn: false,
          isRestoringSession: false,
          isSignedIn: true,
          name: user.data.username ?? user.data.id,
        });
        return true;
      }
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
