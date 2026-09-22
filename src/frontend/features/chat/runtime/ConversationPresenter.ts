import type {
  ConversationMessage,
  ConversationSnapshot,
  HistoryVersion,
} from '@/frontend/appShell/conversation';

/** Retains live rows until history has successfully installed the revision that removed them. */
export class ConversationPresenter {
  private readonly retained = new Map<
    string,
    { message: ConversationMessage; previousVersion?: HistoryVersion }
  >();
  private lastLive: readonly ConversationMessage[] = [];
  private previousVersion?: HistoryVersion;
  private result: readonly ConversationMessage[] = [];
  update(
    snapshot: ConversationSnapshot,
    history: readonly ConversationMessage[],
    installedVersion: HistoryVersion | undefined,
    hasNewerMessages = false,
  ): readonly ConversationMessage[] {
    if (snapshot.freshness.state === 'retired') {
      this.retained.clear();
      this.lastLive = [];
      this.result = [];
      return this.result;
    }
    const liveKeys = new Set(snapshot.liveMessages.map((message) => message.key));
    for (const message of this.lastLive)
      if (!liveKeys.has(message.key) && !this.retained.has(message.key))
        this.retained.set(message.key, { message, previousVersion: this.previousVersion });
    const persistedKeys = new Set(history.map((message) => message.key));
    for (const [key, value] of this.retained) {
      if (
        liveKeys.has(key) ||
        (installedVersion === snapshot.historyVersion &&
          installedVersion !== undefined &&
          (persistedKeys.has(key) || installedVersion !== value.previousVersion))
      )
        this.retained.delete(key);
    }
    this.lastLive = snapshot.liveMessages;
    this.previousVersion = snapshot.historyVersion;
    if (hasNewerMessages) return history;
    const merged = new Map(history.map((message) => [message.key, message]));
    for (const { message } of this.retained.values())
      if (!merged.has(message.key)) merged.set(message.key, message);
    for (const message of snapshot.liveMessages) merged.set(message.key, message);
    const next = [...merged.values()];
    if (
      next.length !== this.result.length ||
      next.some((message, index) => message !== this.result[index])
    )
      this.result = next;
    return this.result;
  }
}
