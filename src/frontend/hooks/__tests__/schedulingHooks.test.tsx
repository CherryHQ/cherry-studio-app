import { act, create, type ReactTestRenderer } from 'react-test-renderer';

import { useDebouncedValue } from '../useDebouncedValue';
import { useElapsedTime } from '../useElapsedTime';
import { useAfterNextFrame, useNextFrame } from '../useNextFrame';
import { useTransientValue } from '../useTransientValue';

describe('shared scheduling hooks', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('useDebouncedValue settles only after value stops changing', () => {
    let latest = '';
    function Probe({ value }: { value: string }) {
      latest = useDebouncedValue(value, 250);
      return null;
    }

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Probe value="a" />);
    });
    expect(latest).toBe('a');

    act(() => {
      renderer.update(<Probe value="ab" />);
    });
    act(() => jest.advanceTimersByTime(200));
    expect(latest).toBe('a');

    act(() => {
      renderer.update(<Probe value="abc" />);
    });
    act(() => jest.advanceTimersByTime(249));
    expect(latest).toBe('a');

    act(() => jest.advanceTimersByTime(1));
    expect(latest).toBe('abc');

    act(() => renderer.unmount());
  });

  it('useTransientValue auto-clears after durationMs and resets when resetKey changes', () => {
    let state!: ReturnType<typeof useTransientValue<string>>;
    function Probe({ resetKey }: { resetKey: string }) {
      state = useTransientValue<string>(500, resetKey);
      return null;
    }

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Probe resetKey="session-1" />);
    });
    expect(state.value).toBeUndefined();

    act(() => state.show('msg-1'));
    expect(state.value).toBe('msg-1');

    act(() => jest.advanceTimersByTime(499));
    expect(state.value).toBe('msg-1');

    act(() => jest.advanceTimersByTime(1));
    expect(state.value).toBeUndefined();

    act(() => state.show('msg-2'));
    expect(state.value).toBe('msg-2');
    act(() => renderer.update(<Probe resetKey="session-2" />));
    expect(state.value).toBeUndefined();

    act(() => renderer.unmount());
  });

  it('useElapsedTime ticks only while active', () => {
    let elapsed = 0;
    function Probe({ active }: { active: boolean }) {
      elapsed = useElapsedTime(active, 1000);
      return null;
    }

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Probe active />);
    });
    expect(elapsed).toBe(0);

    act(() => jest.advanceTimersByTime(2000));
    expect(elapsed).toBe(2000);

    act(() => renderer.update(<Probe active={false} />));
    act(() => jest.advanceTimersByTime(3000));
    expect(elapsed).toBe(2000);

    act(() => renderer.unmount());
  });

  it('useNextFrame replaces pending frames and cancels on unmount', () => {
    const callbacks = new Map<number, () => void>();
    let nextId = 1;
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextId++;
      callbacks.set(id, () => cb(16));
      return id;
    });
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      if (typeof id === 'number') callbacks.delete(id);
    });

    let scheduler!: ReturnType<typeof useNextFrame>;
    function Probe() {
      scheduler = useNextFrame();
      return null;
    }

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Probe />);
    });

    const first = jest.fn();
    const second = jest.fn();
    act(() => {
      scheduler.schedule(first);
      scheduler.schedule(second);
    });
    expect(callbacks.size).toBe(1);

    act(() => {
      const cb = callbacks.get(2);
      callbacks.delete(2);
      cb?.();
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);

    const third = jest.fn();
    act(() => scheduler.schedule(third));
    expect(callbacks.size).toBe(1);
    act(() => renderer.unmount());
    expect(callbacks.size).toBe(0);
    expect(third).not.toHaveBeenCalled();
  });

  it('useAfterNextFrame fires once when active and cancels if deactivated early', () => {
    const callbacks = new Map<number, () => void>();
    let nextId = 1;
    jest.spyOn(globalThis, 'requestAnimationFrame').mockImplementation((cb) => {
      const id = nextId++;
      callbacks.set(id, () => cb(16));
      return id;
    });
    jest.spyOn(globalThis, 'cancelAnimationFrame').mockImplementation((id) => {
      if (typeof id === 'number') callbacks.delete(id);
    });

    const onFrame = jest.fn();
    function Probe({ active }: { active: boolean }) {
      useAfterNextFrame(active, onFrame);
      return null;
    }

    let renderer!: ReactTestRenderer;
    act(() => {
      renderer = create(<Probe active={false} />);
    });
    expect(callbacks.size).toBe(0);

    act(() => renderer.update(<Probe active />));
    expect(callbacks.size).toBe(1);

    act(() => renderer.update(<Probe active={false} />));
    expect(callbacks.size).toBe(0);

    act(() => renderer.update(<Probe active />));
    act(() => {
      const cb = [...callbacks.values()][0];
      cb?.();
    });
    expect(onFrame).toHaveBeenCalledTimes(1);

    act(() => renderer.unmount());
  });
});
