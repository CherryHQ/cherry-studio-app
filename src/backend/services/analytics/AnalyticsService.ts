import { AnalyticsClient, type TokenUsageData } from '@cherrystudio/analytics-client';
import { loggerService } from '@logger';
import Constants from 'expo-constants';
import { Platform, type AppStateStatus } from 'react-native';

import { application } from '@/backend/core/application/Application';
import {
  type Activatable,
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import { isDataCollectionConsented } from '@/shared/utils/privacyConsent';

import { localDateKey } from './analyticsActivity';
import { isAnalyticsClientId, resolveClientId } from './analyticsIdentity';

const logger = loggerService.withContext('AnalyticsService');

const APP_NAME = 'CherryStudioMobile';
/** One channel per store listing; the analytics service splits its reports on it. */
const CHANNEL = Platform.OS === 'ios' ? 'cherry-studio-ios' : 'cherry-studio-android';
/**
 * Shutdown budget, deliberately under the lifecycle manager's own 5s per-service
 * teardown ceiling so a slow drain reports as a dropped batch rather than as an
 * abandoned service stop.
 */
const DESTROY_TIMEOUT_MS = 3_000;

const CONSENT_PREFERENCE_KEYS = {
  dataCollectionEnabled: 'app.privacy.data_collection.enabled',
  policyVersion: 'app.privacy.policy_version',
} as const;

function appVersion(): string {
  return Constants.expoConfig?.version?.trim() || '0.0.0';
}

/**
 * Anonymous product analytics: launches, daily activity, and token usage.
 *
 * Activation follows consent, not the service lifetime — the client only exists
 * while {@link isDataCollectionConsented} holds, and revoking consent destroys it
 * along with anything still queued. Every report is best effort; a failure here
 * never reaches the caller that produced the event.
 */
@Injectable('AnalyticsService')
@DependsOn(['CacheService', 'PreferenceService'])
@ServicePhase(Phase.PostReady)
@AppStatePolicy('continue')
export class AnalyticsService extends BaseService implements Activatable {
  private client: AnalyticsClient | null = null;
  private hasTrackedAppLaunch = false;
  private desiredEnabled = false;
  /**
   * Serializes identity changes against activation. `client_id` is a
   * request-level field, so a pairing that lands mid-activation must not swap it
   * out from under a client that is still being built.
   */
  private tail: Promise<unknown> = Promise.resolve();
  /** In-flight activity ping, so a second `active` cannot ship the day twice. */
  private activityReport: Promise<void> | null = null;

  protected onInit(): void {
    const preference = application.get('PreferenceService');
    const refresh = () => {
      void this.refreshDesiredEnabled().catch((error) =>
        logger.warn('Could not apply the new data-collection consent', error as Error),
      );
    };
    for (const key of Object.values(CONSENT_PREFERENCE_KEYS)) {
      this.registerDisposable(preference.subscribeChange(key)(refresh));
    }
    this.registerAppStateListener(this.handleAppStateChange);
  }

  protected async onReady(): Promise<void> {
    await this.refreshDesiredEnabled();
  }

  async onActivate(): Promise<void> {
    const version = appVersion();
    const clientId = await resolveClientId(application.get('PreferenceService'));
    this.client = new AnalyticsClient({
      channel: CHANNEL,
      clientId,
      headers: {
        'App-Name': APP_NAME,
        'App-Version': `v${version}`,
        'Client-Id': clientId,
        OS: Platform.OS,
        'User-Agent': `${APP_NAME}/${version} (${Platform.OS})`,
      },
      onError: (error) => logger.warn('Analytics request failed', error),
    });

    if (!this.hasTrackedAppLaunch) {
      this.client.trackAppLaunch({ os: Platform.OS, version });
      this.hasTrackedAppLaunch = true;
    }
    // Deliberately not awaited: the lifecycle queues teardown and identity
    // changes behind this hook against a 5s ceiling, while the request behind it
    // can retry for the better part of a minute.
    void this.reportDailyActivity();
  }

  async onDeactivate(): Promise<void> {
    const client = this.client;
    this.client = null;
    if (!client) return;
    try {
      // Losing consent must discard the queue rather than ship it; teardown with
      // consent intact still gets a bounded chance to drain.
      await client.destroy({ flush: this.desiredEnabled, timeoutMs: DESTROY_TIMEOUT_MS });
    } catch (error) {
      logger.warn('Analytics client did not shut down cleanly', error as Error);
    }
  }

  /** Reports one provider invocation. Ignored entirely while collection is off. */
  trackTokenUsage(data: TokenUsageData): void {
    if (!this.desiredEnabled) return;
    // Zero-token and local-embedding events are dropped by the client itself.
    this.client?.trackTokenUsage(data);
  }

  /**
   * Takes over the identity of the desktop this device just paired with, so one
   * user's computer and phone report as one client.
   */
  async adoptClientId(candidate: string): Promise<void> {
    if (!isAnalyticsClientId(candidate)) return;
    await this.run(async () => {
      const preference = application.get('PreferenceService');
      if ((preference.getCachedValue('app.user.id') ?? '') === candidate) return;
      // Queued events carry no identity of their own; drain them under the old
      // one or the server reattributes them to the desktop.
      await this.client?.flush().catch(() => undefined);
      await preference.set('app.user.id', candidate);
      this.client?.setClientId(candidate);
      logger.info('Adopted the paired desktop analytics identity');
    });
  }

  private refreshDesiredEnabled(): Promise<void> {
    const { dataCollectionEnabled, policyVersion } = application
      .get('PreferenceService')
      .getMultipleCached(CONSENT_PREFERENCE_KEYS);
    this.desiredEnabled = isDataCollectionConsented(dataCollectionEnabled, policyVersion);
    return this.run(async () => {
      if (this.desiredEnabled) await this.activate();
      else await this.deactivate();
    });
  }

  private readonly handleAppStateChange = (status: AppStateStatus) => {
    if (status === 'background') {
      // Timers stop outside the foreground, so the client's own interval cannot
      // be relied on to ship what is queued.
      void this.client?.flush().catch(() => undefined);
      return;
    }
    if (status === 'active') void this.reportDailyActivity();
  };

  /** Serialized: the date is only recorded once the request lands. */
  private reportDailyActivity(): Promise<void> {
    return (this.activityReport ??= this.sendDailyActivity().finally(() => {
      this.activityReport = null;
    }));
  }

  private async sendDailyActivity(): Promise<void> {
    const client = this.client;
    if (!client) return;
    const cache = application.get('CacheService');
    const today = localDateKey(new Date());
    if (cache.getPersist('analytics.last_activity_date') === today) return;
    try {
      await client.trackAppUpdate();
      cache.setPersist('analytics.last_activity_date', today);
    } catch (error) {
      logger.warn('Could not report daily activity', error as Error);
    }
  }

  private run<T>(operation: () => Promise<T>): Promise<T> {
    const next = this.tail.then(operation);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }
}
