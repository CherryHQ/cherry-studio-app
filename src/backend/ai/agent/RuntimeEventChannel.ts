import type { RuntimeEvent } from './types';

/**
 * A single-producer/single-consumer async buffer of {@link RuntimeEvent}s.
 *
 * Runtime sessions produce events from callbacks (stream loops, tool execute
 * wrappers, approval responses) while the Host consumes them through the
 * `execute()` AsyncIterable. Pushes after `end()` are dropped, which lets a
 * session enforce "no event may follow a terminal event" at the boundary.
 */
export class RuntimeEventChannel {
  private readonly queued: RuntimeEvent[] = [];
  private readonly waiting: ((result: IteratorResult<RuntimeEvent>) => void)[] = [];
  private ended = false;

  push(event: RuntimeEvent): void {
    if (this.ended) {
      return;
    }
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
    } else {
      this.queued.push(event);
    }
  }

  end(): void {
    if (this.ended) {
      return;
    }
    this.ended = true;
    for (const waiter of this.waiting.splice(0)) {
      waiter({ value: undefined, done: true });
    }
  }

  async *drain(): AsyncGenerator<RuntimeEvent> {
    while (true) {
      const buffered = this.queued.shift();
      if (buffered !== undefined) {
        yield buffered;
        continue;
      }
      if (this.ended) {
        return;
      }
      const next = await new Promise<IteratorResult<RuntimeEvent>>((resolve) => {
        this.waiting.push(resolve);
      });
      if (next.done) {
        return;
      }
      yield next.value;
    }
  }
}
