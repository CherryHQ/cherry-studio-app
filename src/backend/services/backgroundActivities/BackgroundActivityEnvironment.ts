import { BaseService, Injectable, Phase, ServicePhase } from '@/backend/core/lifecycle';
import type { BackgroundReplyActivityProps } from '@/shared/backgroundActivities/chatReply';
import type { PaintingActivityProps } from '@/shared/backgroundActivities/painting';

import { noopBackgroundActivityPresenter, type BackgroundActivityPresenter } from './presenter';

export type BackgroundActivityTranslate = (key: string) => string;

export type BackgroundActivityEnvironmentConfig = {
  assistantPresenter: BackgroundActivityPresenter<BackgroundReplyActivityProps>;
  paintingPresenter: BackgroundActivityPresenter<PaintingActivityProps>;
  translate: BackgroundActivityTranslate;
};

const defaultConfig = (): BackgroundActivityEnvironmentConfig => ({
  assistantPresenter: noopBackgroundActivityPresenter(),
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

  get paintingPresenter(): BackgroundActivityPresenter<PaintingActivityProps> {
    return this.config.paintingPresenter;
  }

  translate = (key: string): string => this.config.translate(key);

  get presenters(): readonly { clearOrphans(): Promise<number> }[] {
    return [this.config.assistantPresenter, this.config.paintingPresenter];
  }
}
