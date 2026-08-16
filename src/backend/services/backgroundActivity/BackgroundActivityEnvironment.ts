import { CHERRY_ACTIVITY_LOGO_BASE64 } from '@cherrystudio/ui/background-activity';
import { File } from 'expo-file-system';

import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivity/chatReply';
import type { PaintingActivityProps } from '@/shared/backgroundActivity/painting';
import { loggerService } from '@/shared/core/logger/LoggerService';

import { noopBackgroundActivityPresenter, type BackgroundActivityPresenter } from './presenter';

const logger = loggerService.withContext('BackgroundActivityEnvironment');

export type BackgroundActivityTranslate = (key: string) => string;

export type BackgroundActivityEnvironmentConfig = {
  assistantPresenter: BackgroundActivityPresenter<BackgroundReplyActivityProps>;
  getColorScheme: () => 'dark' | 'light';
  paintingPresenter: BackgroundActivityPresenter<PaintingActivityProps>;
  translate: BackgroundActivityTranslate;
};

const defaultConfig = (): BackgroundActivityEnvironmentConfig => ({
  assistantPresenter: noopBackgroundActivityPresenter(),
  getColorScheme: () => 'light',
  paintingPresenter: noopBackgroundActivityPresenter(),
  translate: (key) => key,
});

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

  get paintingPresenter(): BackgroundActivityPresenter<PaintingActivityProps> {
    return this.config.paintingPresenter;
  }

  translate = (key: string): string => this.config.translate(key);

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
