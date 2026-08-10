import { IdleTimeoutController, type IdleTimeoutHandle } from './IdleTimeoutController';

export function withIdleTimeout<T>(
  source: ReadableStream<T>,
  controller: AbortController,
  timeoutMs: number,
): { idle: IdleTimeoutHandle; stream: ReadableStream<T> } {
  const idle = new IdleTimeoutController(timeoutMs);
  const onIdleAbort = () => {
    if (!controller.signal.aborted) {
      controller.abort(new DOMException('Stream idle timeout exceeded', 'TimeoutError'));
    }
  };
  idle.signal.addEventListener('abort', onIdleAbort, { once: true });
  const reader = source.getReader();
  const cleanup = () => {
    idle.cleanup();
    idle.signal.removeEventListener('abort', onIdleAbort);
  };

  return {
    idle,
    stream: new ReadableStream<T>({
      async pull(destination) {
        try {
          const { done, value } = await reader.read();
          if (done) {
            cleanup();
            destination.close();
            return;
          }
          idle.reset();
          destination.enqueue(value);
        } catch (error) {
          cleanup();
          destination.error(error);
        }
      },
      cancel(reason) {
        cleanup();
        return reader.cancel(reason);
      },
    }),
  };
}
