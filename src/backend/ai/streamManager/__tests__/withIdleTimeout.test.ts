import { withIdleTimeout } from '../withIdleTimeout';

describe('withIdleTimeout', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('resets the timeout after every chunk', async () => {
    const source = createControllableStream<number>();
    const abortController = new AbortController();
    const { stream } = withIdleTimeout(source.stream, abortController, 1000);
    const reader = stream.getReader();

    for (let index = 0; index < 3; index += 1) {
      jest.advanceTimersByTime(800);
      source.push(index);
      await expect(reader.read()).resolves.toEqual({ done: false, value: index });
    }
    expect(abortController.signal.aborted).toBe(false);

    jest.advanceTimersByTime(1000);
    expect(abortController.signal.aborted).toBe(true);
    expect((abortController.signal.reason as DOMException).name).toBe('TimeoutError');
  });

  test('supports a bounded approval wait and cleans up on cancel', async () => {
    const source = createControllableStream<number>();
    const abortController = new AbortController();
    const { idle, stream } = withIdleTimeout(source.stream, abortController, 1000);
    const reader = stream.getReader();
    source.push(1);
    await reader.read();

    idle.reset(5000);
    jest.advanceTimersByTime(4999);
    expect(abortController.signal.aborted).toBe(false);
    await reader.cancel();
    jest.advanceTimersByTime(10_000);
    expect(abortController.signal.aborted).toBe(false);
  });
});

function createControllableStream<T>() {
  let controller!: ReadableStreamDefaultController<T>;
  return {
    stream: new ReadableStream<T>({
      start(nextController) {
        controller = nextController;
      },
    }),
    push(value: T) {
      controller.enqueue(value);
    },
  };
}
