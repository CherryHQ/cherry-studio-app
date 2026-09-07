import type { RuntimeEvent } from './types';

type ChannelEntry = { event: RuntimeEvent; consumed?: () => void };

/**
 * A single-producer/single-consumer async buffer of {@link RuntimeEvent}s.
 *
 * Runtime sessions produce events from callbacks (stream loops, tool execute
 * wrappers, approval responses) while the Host consumes them through the
 * `execute()` AsyncIterable. Pushes after `end()` are dropped, which lets a
 * session enforce "no event may follow a terminal event" at the boundary.
 */
export class RuntimeEventChannel {
  private readonly queued: ChannelEntry[] = [];
  private readonly waiting: ((result: IteratorResult<ChannelEntry>) => void)[] = [];
  private ended = false;

  push(event: RuntimeEvent): void {
    this.enqueue({ event });
  }

  /** Pause a producer at a segment boundary until its consumer requests the next event. */
  pushAndWait(event: RuntimeEvent): Promise<void> {
    return new Promise((consumed) => this.enqueue({ event, consumed }));
  }

  private enqueue(entry: ChannelEntry): void {
    if (this.ended) {
      entry.consumed?.();
      return;
    }
    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: entry, done: false });
    } else {
      this.queued.push(entry);
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
        try {
          yield buffered.event;
        } finally {
          buffered.consumed?.();
        }
        continue;
      }
      if (this.ended) {
        return;
      }
      const next = await new Promise<IteratorResult<ChannelEntry>>((resolve) => {
        this.waiting.push(resolve);
      });
      if (next.done) {
        return;
      }
      try {
        yield next.value.event;
      } finally {
        next.value.consumed?.();
      }
    }
  }
}
