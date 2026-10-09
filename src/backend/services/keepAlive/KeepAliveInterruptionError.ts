const messages = {
  'service-stopped': 'The system stopped background execution.',
  'execution-limit': 'Background execution reached its time limit.',
};

/** Distinguishes platform interruption from user cancellation without platform checks in callers. */
export class KeepAliveInterruptionError extends Error {
  constructor(
    readonly reason: keyof typeof messages,
    options?: ErrorOptions,
  ) {
    super(messages[reason], options);
    this.name = 'KeepAliveInterruptionError';
  }
}
