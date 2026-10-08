import { linkAbortSignals } from '../linkAbortSignals';

function trackListeners(signal: AbortSignal) {
  const active = new Set<EventListenerOrEventListenerObject>();
  const add = signal.addEventListener.bind(signal);
  const remove = signal.removeEventListener.bind(signal);
  jest.spyOn(signal, 'addEventListener').mockImplementation((type, listener, options) => {
    if (type === 'abort' && listener) active.add(listener);
    add(type, listener, options);
  });
  jest.spyOn(signal, 'removeEventListener').mockImplementation((type, listener, options) => {
    if (type === 'abort' && listener) active.delete(listener);
    remove(type, listener, options);
  });
  return active;
}

afterEach(() => {
  jest.restoreAllMocks();
});

it('detaches from long-lived sources when disposed', () => {
  const lifetime = new AbortController();
  const listeners = trackListeners(lifetime.signal);

  for (let index = 0; index < 3; index += 1) {
    const caller = new AbortController();
    const linked = linkAbortSignals([caller.signal, lifetime.signal]);
    expect(listeners.size).toBe(1);
    linked.dispose();
    expect(listeners.size).toBe(0);
  }

  lifetime.abort();
});

it('aborts with the first source reason and detaches from the others', () => {
  const lifetime = new AbortController();
  const caller = new AbortController();
  const listeners = trackListeners(lifetime.signal);
  const linked = linkAbortSignals([lifetime.signal, caller.signal]);
  const reason = new Error('caller left');

  caller.abort(reason);

  expect(linked.signal.aborted).toBe(true);
  expect(linked.signal.reason).toBe(reason);
  expect(listeners.size).toBe(0);
  lifetime.abort(new Error('later'));
  expect(linked.signal.reason).toBe(reason);
});

it('starts aborted when a source already aborted', () => {
  const lifetime = new AbortController();
  const listeners = trackListeners(lifetime.signal);
  const reason = new Error('closed');
  const closed = new AbortController();
  closed.abort(reason);

  const linked = linkAbortSignals([lifetime.signal, closed.signal]);

  expect(linked.signal.reason).toBe(reason);
  expect(listeners.size).toBe(0);
  linked.dispose();
});

it('keeps a disposed signal unaborted when a source aborts later', () => {
  const lifetime = new AbortController();
  const linked = linkAbortSignals([lifetime.signal]);

  linked.dispose();
  lifetime.abort();

  expect(linked.signal.aborted).toBe(false);
});
