import { CHERRY_ACTIVITY_LOGO_BASE64 } from '@cherrystudio/ui/background-activity';
import { File } from 'expo-file-system';

import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { ForegroundActivityAttention } from '@/shared/backgroundActivity/attention';
import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';
import type { PaintingActivityProps } from '@/shared/backgroundActivity/painting';
import { loggerService } from '@/shared/core/logger/LoggerService';

import type { ReplyCompletionNotifier } from '../backgroundReply/replyCompletionNotifications';
import { noopBackgroundActivityPresenter, type BackgroundActivityPresenter } from './presenter';

const logger = loggerService.withContext('BackgroundActivityEnvironment');

export type BackgroundActivityTranslate = (key: string) => string;

export type BackgroundActivityEnvironmentConfig = {
  assistantPresenter: BackgroundActivityPresenter<BackgroundReplyActivityProps>;
  getColorScheme: () => 'dark' | 'light';
  /** Platform presentation preference; independent of a task's execution lease. */
  isPresentationEnabled?: () => boolean;
  subscribePresentationEnabled?: (listener: () => void) => () => void;
  onForegroundAttention?: (attention: ForegroundActivityAttention) => void;
  paintingPresenter: BackgroundActivityPresenter<PaintingActivityProps>;
  /** Whether finishing chat replies may raise a system notification. */
  isReplyCompletionNotificationEnabled: () => boolean;
  /** iOS reply completion notices; absent means the platform owns another channel. */
  replyNotifications?: ReplyCompletionNotifier;
  /** Deep link of the focused, foreground task surface. Absent sources never report one. */
  subscribeVisibleTask?: (listener: (deepLinkUrl: string | undefined) => void) => () => void;
  translate: BackgroundActivityTranslate;
};

const defaultConfig = (): BackgroundActivityEnvironmentConfig => ({
  assistantPresenter: noopBackgroundActivityPresenter(),
  getColorScheme: () => 'light',
  isReplyCompletionNotificationEnabled: () => false,
  paintingPresenter: noopBackgroundActivityPresenter(),
  translate: (key) => key,
});

const noSubscription = () => () => {};

/**
 * Host-scoped platform inputs for background surfaces.
 *
 * Bootstrap configures this instance before installing the host. Keeping the
 * inputs on the host prevents backend services from importing frontend widget
 * layouts while still replacing the complete graph on Fast Refresh and in
 * tests. The defaults make unsupported platforms a no-op capability.
 */
@Injectable('BackgroundActivityEnvironment')
@ServicePhase(Phase.PostReady)
export class BackgroundActivityEnvironment extends BaseService {
  private config: BackgroundActivityEnvironmentConfig = defaultConfig();

  configure(config: BackgroundActivityEnvironmentConfig): void {
    this.config = config;
  }

  get assistantPresenter(): BackgroundActivityPresenter<BackgroundReplyActivityProps> {
    return this.config.assistantPresenter;
  }

  getColorScheme = (): 'dark' | 'light' => this.config.getColorScheme();

  isPresentationEnabled = (): boolean => this.config.isPresentationEnabled?.() ?? true;

  subscribePresentationEnabled = (listener: () => void): (() => void) =>
    this.config.subscribePresentationEnabled?.(listener) ?? noSubscription();

  get paintingPresenter(): BackgroundActivityPresenter<PaintingActivityProps> {
    return this.config.paintingPresenter;
  }

  translate = (key: string): string => this.config.translate(key);

  /**
   * Subscribes to the task surface the user is currently looking at. The
   * configured source is read per call, so a Fast Refresh replacement takes
   * effect on the next subscription rather than leaking the previous graph.
   */
  subscribeVisibleTask = (listener: (deepLinkUrl: string | undefined) => void): (() => void) =>
    (this.config.subscribeVisibleTask ?? noSubscription)(listener);

  isReplyCompletionNotificationEnabled = (): boolean =>
    this.config.isReplyCompletionNotificationEnabled();

  get replyNotifications(): ReplyCompletionNotifier | undefined {
    return this.config.replyNotifications;
  }

  onForegroundAttention = (attention: ForegroundActivityAttention): void => {
    this.config.onForegroundAttention?.(attention);
  };

  get presenters(): readonly { clearOrphans(): Promise<number> }[] {
    return [this.config.assistantPresenter, this.config.paintingPresenter];
  }

  async prepareLogo(): Promise<string | undefined> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports -- lazy native-module load
      const { widgetsDirectory } = require('expo-widgets') as {
        widgetsDirectory?: string | null;
      };
      if (!widgetsDirectory) {
        return undefined;
      }
      const destination = new File(widgetsDirectory, 'cherry-studio-logo.png');
      destination.write(CHERRY_ACTIVITY_LOGO_BASE64, { encoding: 'base64' });
      return destination.uri;
    } catch (error) {
      logger.warn('Background activity logo preparation failed', error as Error);
      return undefined;
    }
  }
}
