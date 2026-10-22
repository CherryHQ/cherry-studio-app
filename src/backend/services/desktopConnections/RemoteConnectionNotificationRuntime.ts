import { loggerService } from '@logger';
import { resolveScheme } from 'expo-linking';
import { Platform } from 'react-native';

import {
  AppStatePolicy,
  BaseService,
  DependsOn,
  Injectable,
  Phase,
  ServicePhase,
} from '@/backend/core/lifecycle';
import type { AndroidBackgroundActivityRuntime } from '@/backend/services/backgroundActivity/AndroidBackgroundActivityRuntime';
import type { BackgroundActivityEnvironment } from '@/backend/services/backgroundActivity/BackgroundActivityEnvironment';
import type {
  KeepAliveCoordinator,
  KeepAliveLease,
} from '@/backend/services/keepAlive/KeepAliveCoordinator';

import type { DesktopConnectionManager } from './DesktopConnectionManager';

const logger = loggerService.withContext('RemoteConnectionNotification');

/** One host owns connection demand; ending a route or remote task does not release it. */
@Injectable('RemoteConnectionNotificationRuntime')
@DependsOn([
  'DesktopConnectionManager',
  'KeepAliveCoordinator',
  'AndroidBackgroundActivityRuntime',
  'BackgroundActivityEnvironment',
])
@ServicePhase(Phase.Gate)
@AppStatePolicy('continue')
export class RemoteConnectionNotificationRuntime extends BaseService {
  private lease?: KeepAliveLease;
  private disposed = false;
  private signature?: string;

  constructor(
    private readonly connections: DesktopConnectionManager,
    private readonly keepAlive: KeepAliveCoordinator,
    private readonly android: AndroidBackgroundActivityRuntime,
    private readonly environment: BackgroundActivityEnvironment,
  ) {
    super();
  }

  protected onInit(): void {
    if (Platform.OS !== 'android') return;
    this.connections.enablePersistentConnections();
    this.registerDisposable(this.connections.subscribeConnections(() => this.reconcile()));
    this.registerDisposable(
      this.environment.subscribeActions((response) => {
        if (this.disposed || response.actionId !== 'disconnect') return;
        const connection = this.connections
          .getPersistentConnections()
          .find((item) => item.token === response.token);
        if (connection) this.connections.disconnect(connection.id);
      }),
    );
    this.reconcile();
  }

  private reconcile(): void {
    if (this.disposed) return;
    const connections = this.connections.getPersistentConnections();
    const notifications = connections.map((connection) => ({
      connectionId: connection.id,
      key: `remote-connection:${connection.id}`,
      title: connection.name,
      body: this.environment.translate(
        connection.status === 'connected'
          ? 'notifications.remote.connected'
          : 'remoteAgent.connecting',
      ),
      url: `${resolveScheme({})}://remote?connectionId=${encodeURIComponent(connection.id)}`,
      token: connection.token,
      disconnectLabel: this.environment.translate('notifications.remote.disconnect'),
    }));
    const signature = JSON.stringify(notifications);
    if (signature !== this.signature) {
      this.signature = signature;
      void this.android.setRemoteConnections(notifications).catch((error: unknown) => {
        this.signature = undefined;
        logger.warn('Could not update connection notification', { error });
      });
    }
    if (connections.length && !this.lease) {
      this.lease = this.keepAlive.acquire('remote.connection', () => {
        // A platform deadline also releases transport and retries, never desktop execution.
        for (const connection of this.connections.getPersistentConnections())
          this.connections.disconnect(connection.id);
        this.lease = undefined;
      });
    } else if (!connections.length) {
      this.lease?.release();
      this.lease = undefined;
    }
  }

  protected async onStop(): Promise<void> {
    this.disposed = true;
    this.lease?.release();
    this.lease = undefined;
    if (Platform.OS === 'android') await this.android.setRemoteConnections([]);
  }
}
