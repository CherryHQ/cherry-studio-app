import type { BackgroundReplyLifecycle } from '../backgroundReply';
import type { KeepAliveSource } from '../keepAlive/KeepAliveCoordinator';

export type RemoteBackgroundExecution = {
  replies: BackgroundReplyLifecycle;
  keepAlive: KeepAliveSource;
  translate(key: string): string;
};
